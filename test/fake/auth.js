const user = { uid: "me", email: "me@vela.test" };
export const getAuth = () => ({ currentUser: user });
export const onAuthStateChanged = (a, cb) => { setTimeout(() => { cb(window.__noAuth ? null : user); }, 150); return () => {}; };
export const signInWithEmailAndPassword = async () => ({ user });
export const createUserWithEmailAndPassword = async () => ({ user });
export const signOut = async () => {};
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
