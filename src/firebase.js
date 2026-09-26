import { initializeApp } from "firebase/app";
import { getDatabase, ref as dbRef, set, onValue, get } from "firebase/database";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyBqsawmCM5aqSxegQt3dXErH9XnyqS_0n4",
    authDomain: "vtt-light.firebaseapp.com",
    projectId: "vtt-light",
    storageBucket: "vtt-light.firebasestorage.app",
    messagingSenderId: "744744325206",
    appId: "1:744744325206:web:cd89fbf90da6a802aaabf7",
    databaseURL: "https://vtt-light-default-rtdb.europe-west1.firebasedatabase.app"
};

export const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

export const dbRefs = {
    walls: dbRef(db, 'walls'),
    lights: dbRef(db, 'lights'),
    tokens: dbRef(db, 'tokens'),
    tokenSettings: dbRef(db, 'tokenSettings'),
    mapData: dbRef(db, 'map'),
    movementLock: dbRef(db, 'movementLock'),
    haloRadius: dbRef(db, 'haloRadius')
};

// Re-export common functions so other modules don't have to import from 'firebase' directly
export { db, set, onValue, get, dbRef, storage, storageRef, uploadBytes, getDownloadURL };