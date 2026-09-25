import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { ref, getBytes, uploadBytes } from "firebase/storage";

const projectId = "razzberry-rules-test";
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
    storage: { rules: await readFile(new URL("../storage.rules", import.meta.url), "utf8") },
  });
});

after(async () => testEnv?.cleanup());

test("Firestore access is denied to anonymous and authenticated clients", async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  const signedInDb = testEnv.authenticatedContext("sample-user").firestore();
  await assertFails(getDoc(doc(anonymousDb, "profiles/sample-user")));
  await assertFails(setDoc(doc(signedInDb, "profiles/sample-user"), { name: "Sample" }));
});

test("users can read only their own conversations and cannot write from the client", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/sample-user/conversations/chat-1234567890"), {
      title: "My chat", messageCount: 1,
    });
    await setDoc(doc(context.firestore(), "users/sample-user/conversations/chat-1234567890/messages/00000000"), { role: "user", content: "Hello", sequence: 0 });
  });
  const owner = testEnv.authenticatedContext("sample-user").firestore();
  const otherUser = testEnv.authenticatedContext("different-user").firestore();
  const anonymous = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(owner, "users/sample-user/conversations/chat-1234567890")));
  await assertSucceeds(getDocs(collection(owner, "users/sample-user/conversations")));
  await assertSucceeds(getDoc(doc(owner, "users/sample-user/conversations/chat-1234567890/messages/00000000")));
  await assertFails(getDoc(doc(otherUser, "users/sample-user/conversations/chat-1234567890")));
  await assertFails(getDocs(collection(otherUser, "users/sample-user/conversations")));
  await assertFails(getDoc(doc(otherUser, "users/sample-user/conversations/chat-1234567890/messages/00000000")));
  await assertFails(setDoc(doc(owner, "users/sample-user/conversations/another-chat-1234567890"), { title: "Nope" }));
  await assertFails(getDoc(doc(anonymous, "users/sample-user/conversations/chat-1234567890")));
});

test("Storage access is denied to anonymous and authenticated clients", async () => {
  const anonymousStorage = testEnv.unauthenticatedContext().storage();
  const signedInStorage = testEnv.authenticatedContext("sample-user").storage();
  await assertFails(getBytes(ref(anonymousStorage, "uploads/sample.txt")));
  await assertFails(uploadBytes(ref(signedInStorage, "uploads/sample.txt"), new Uint8Array([1])));
});
