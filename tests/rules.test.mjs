import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
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

test("Storage access is denied to anonymous and authenticated clients", async () => {
  const anonymousStorage = testEnv.unauthenticatedContext().storage();
  const signedInStorage = testEnv.authenticatedContext("sample-user").storage();
  await assertFails(getBytes(ref(anonymousStorage, "uploads/sample.txt")));
  await assertFails(uploadBytes(ref(signedInStorage, "uploads/sample.txt"), new Uint8Array([1])));
});
