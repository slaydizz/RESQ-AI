import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // You will get these keys from the Firebase Console (Project Settings)
  apiKey: "AIzaSyDsQFa7WPR9hP4mxgb374o5LiFtfyBNbSU",
  authDomain: "akshu-997ed.firebaseapp.com",
  projectId: "akshu-997ed",
  storageBucket: "akshu-997ed.firebasestorage.app",
  messagingSenderId: "680843682247",
  appId: "1:680843682247:web:177ed621095e9ec739b9e2"
  
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);