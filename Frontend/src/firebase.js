import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCPoHPnU67g534-LeivaHUzFwqVBpZdmoU",
  authDomain: "edcode-c3159.firebaseapp.com",
  projectId: "edcode-c3159",
  storageBucket: "edcode-c3159.firebasestorage.app",
  messagingSenderId: "1090087196659",
  appId: "1:1090087196659:web:9b41b3fa546cea3a1ce486"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);