import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { ConflictError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { type TestDb, createTestDb } from "@/test/db";
import { claimGuest, createGuest, findById, login, register, toPublicUser } from "./service";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t?.close());

let counter = 0;
const uniqueEmail = () => `user${counter++}@example.com`;

describe("register", () => {
  it("creates a non-guest with a hashed password", async () => {
    const email = uniqueEmail();
    const {user: user} = await register({ displayName: "Alice", email, password: "a good password" }, t.db);

    expect(user.displayName).toBe("Alice");
    expect(user.email).toBe(email);
    expect(user.isGuest).toBe(false);
    expect(user.passwordHash).not.toBeNull();
    // Never store the plaintext.
    expect(user.passwordHash).not.toContain("a good password");
    await expect(verifyPassword("a good password", user.passwordHash!)).resolves.toBe(true);
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    await register({ displayName: "First", email, password: "a good password" }, t.db);
    await expect(
      register({ displayName: "Second", email, password: "another password" }, t.db),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a duplicate email differing only in case", async () => {
    const email = uniqueEmail();
    await register({ displayName: "First", email, password: "a good password" }, t.db);
    await expect(
      register({ displayName: "Second", email: email.toUpperCase(), password: "pw12345678" }, t.db),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("login", () => {
  it("accepts correct credentials", async () => {
    const email = uniqueEmail();
    const {created: created} = await register({ displayName: "Bob", email, password: "hunter2hunter2" }, t.db);
    const found = await login({ email, password: "hunter2hunter2" }, t.db);
    expect(found.id).toBe(created.id);
  });

  it("rejects a wrong password", async () => {
    const email = uniqueEmail();
    await register({ displayName: "Bob", email, password: "hunter2hunter2" }, t.db);
    await expect(login({ email, password: "wrong password" }, t.db)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects an unknown email with the same message as a wrong password", async () => {
    const email = uniqueEmail();
    await register({ displayName: "Bob", email, password: "hunter2hunter2" }, t.db);

    const wrongPassword = await login({ email, password: "nope nope nope" }, t.db).catch((e) => e);
    const unknownEmail = await login(
      { email: "nobody@example.com", password: "nope nope nope" },
      t.db,
    ).catch((e) => e);

    // Not leaking which accounts exist.
    expect(unknownEmail.message).toBe(wrongPassword.message);
  });

  it("refuses to sign in a guest (no password set)", async () => {
    const guest = await createGuest({ displayName: "Ghost" }, {}, t.db);
    expect(guest.email).toBeNull();
    await expect(
      login({ email: "ghost@example.com", password: "anything at all" }, t.db),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refuses a soft-deleted account", async () => {
    const email = uniqueEmail();
    const {user: user} = await register({ displayName: "Gone", email, password: "hunter2hunter2" }, t.db);
    await t.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id));

    await expect(login({ email, password: "hunter2hunter2" }, t.db)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe("createGuest", () => {
  it("creates a guest with no credentials", async () => {
    const guest = await createGuest({ displayName: "Table Guest" }, {}, t.db);
    expect(guest.isGuest).toBe(true);
    expect(guest.email).toBeNull();
    expect(guest.passwordHash).toBeNull();
  });

  it("records who created the guest", async () => {
    const {host: host} = await register(
      { displayName: "Host", email: uniqueEmail(), password: "a good password" },
      t.db,
    );
    const guest = await createGuest(
      { displayName: "Their Friend" },
      { createdByUserId: host.id },
      t.db,
    );
    expect(guest.createdByUserId).toBe(host.id);
  });
});

describe("claimGuest", () => {
  it("upgrades a guest in place, preserving the user id", async () => {
    const guest = await createGuest({ displayName: "Claimable" }, {}, t.db);
    const email = uniqueEmail();

    const claimed = await claimGuest(
      { guestUserId: guest.id, email, password: "my new password" },
      t.db,
    );

    // Same row: all match history and ratings follow automatically.
    expect(claimed.id).toBe(guest.id);
    expect(claimed.displayName).toBe("Claimable");
    expect(claimed.isGuest).toBe(false);
    expect(claimed.email).toBe(email);
    await expect(login({ email, password: "my new password" }, t.db)).resolves.toMatchObject({
      id: guest.id,
    });
  });

  it("refuses to claim an already-claimed profile", async () => {
    const guest = await createGuest({ displayName: "Twice" }, {}, t.db);
    await claimGuest({ guestUserId: guest.id, email: uniqueEmail(), password: "first password" }, t.db);

    await expect(
      claimGuest({ guestUserId: guest.id, email: uniqueEmail(), password: "second password" }, t.db),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses an email already in use", async () => {
    const email = uniqueEmail();
    await register({ displayName: "Existing", email, password: "a good password" }, t.db);
    const guest = await createGuest({ displayName: "Hopeful" }, {}, t.db);

    await expect(
      claimGuest({ guestUserId: guest.id, email, password: "a good password" }, t.db),
    ).rejects.toBeInstanceOf(ConflictError);

    // The failed claim must not have partially applied.
    const after = await findById(guest.id, t.db);
    expect(after?.isGuest).toBe(true);
    expect(after?.email).toBeNull();
  });

  it("404s on an unknown guest id", async () => {
    await expect(
      claimGuest(
        {
          guestUserId: "00000000-0000-4000-8000-000000000000",
          email: uniqueEmail(),
          password: "a good password",
        },
        t.db,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("toPublicUser", () => {
  it("never exposes email or password hash", async () => {
    const {user: user} = await register(
      { displayName: "Public", email: uniqueEmail(), password: "a good password" },
      t.db,
    );
    const shape = toPublicUser(user);
    expect(Object.keys(shape).sort()).toEqual(["avatarUrl", "displayName", "id", "isGuest"]);
    expect(JSON.stringify(shape)).not.toContain("@example.com");
    expect(JSON.stringify(shape)).not.toContain("scrypt$");
  });
});
