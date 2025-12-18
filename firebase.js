import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBP8pegLDD1mDQM-twdcyGFawMi4Y3Jxos",
  authDomain: "life-drops-e4fde.firebaseapp.com",
  projectId: "life-drops-e4fde",
  storageBucket: "life-drops-e4fde.appspot.com",
  messagingSenderId: "411157656314",
  appId: "1:411157656314:web:eecaef5ec83b2b6cf30f43"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
