import React, { useState, useEffect } from "react";
import { User, ModuleData, GeneratedModule } from "./types";
import { LogIn, LayoutDashboard, FilePlus, Settings, LogOut, FileText, Download, Loader2, Sparkles, CheckCircle2, AlertCircle, ChevronLeft, Menu, X, Users, UserPlus, Edit, Trash2, Lock, Unlock, Github, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateModulAjar, suggestTopics, suggestObjectives } from "./services/ai";
import ReactMarkdown from "react-markdown";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import html2pdf from "html2pdf.js";
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, handleFirestoreError, OperationType, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, deleteDoc } from "firebase/firestore";

// --- API Wrapper for GAS Compatibility ---
const apiCall = async (endpoint: string, options?: RequestInit): Promise<any> => {
  // @ts-ignore
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      const run = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
      const body = options?.body ? JSON.parse(options.body as string) : {};
      
      if (endpoint === '/api/login') {
        run.apiLogin(body.email, body.password);
      } else if (endpoint === '/api/register') {
        run.apiRegister(body);
      } else if (endpoint === '/api/validate-code') {
        run.apiValidateCode(body.kode);
      } else if (endpoint === '/api/admin/users' && (!options?.method || options.method === 'GET')) {
        run.apiGetUsers();
      } else if (endpoint === '/api/admin/users' && options?.method === 'POST') {
        run.apiAddUser(body);
      } else if (endpoint.startsWith('/api/admin/users/') && options?.method === 'PUT') {
        const id = endpoint.split('/')[4];
        run.apiUpdateUser({ id, ...body });
      } else if (endpoint.startsWith('/api/admin/users/') && options?.method === 'DELETE') {
        const id = endpoint.split('/')[4];
        run.apiDeleteUser(id);
      } else if (endpoint === '/api/save-module') {
        run.apiSaveModule(body);
      } else if (endpoint.endsWith('/download')) {
        const id = endpoint.split('/')[3];
        run.apiIncrementDownload(id);
      } else {
        resolve({ success: true, message: "Endpoint simulated in GAS" });
      }
    });
  } else {
    // Standalone / Preview mode
    console.log(`[API Simulation] ${options?.method || 'GET'} ${endpoint}`);
    
    // If it's a real fetch, handle non-JSON gracefully
    try {
      const res = await fetch(endpoint, options);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        // If not JSON (like 404 HTML), return success for sync endpoints to avoid blocking
        if (endpoint.includes('/api/')) {
          return { success: true, message: "Simulated success in preview" };
        }
        throw e;
      }
    } catch (err) {
      // In preview, we don't want to block Firebase operations if GAS is unreachable
      return { success: true, message: "Simulated success (offline/preview)" };
    }
  }
};

// --- Components ---

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "user" as "admin" | "user", package: "basic" as "basic" | "premium", downloadCount: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const q = collection(db, "users");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "users");
    });

    return () => unsubscribe();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      if (editingUser) {
        const userRef = doc(db, "users", editingUser.id);
        await updateDoc(userRef, {
          name: newUser.name,
          role: newUser.role,
          package: newUser.package,
          downloadCount: newUser.downloadCount
        });
        
        // Sync to GAS
        await apiCall(`/api/admin/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newUser),
        });
      } else {
        // For new users, we'd ideally use Firebase Auth to create them, 
        // but for admin management we'll just create the Firestore doc.
        const id = Math.random().toString(36).substr(2, 9);
        await setDoc(doc(db, "users", id), {
          id,
          ...newUser
        });
        
        // Sync to GAS
        await apiCall("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newUser),
        });
      }
      
      setShowAddForm(false);
      setEditingUser(null);
      setNewUser({ email: "", password: "", name: "", role: "user", package: "basic", downloadCount: 0 });
    } catch (err) {
      console.error(err);
      alert(editingUser ? "Gagal mengupdate user" : "Gagal menambah user");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setNewUser({ 
      email: user.email, 
      password: "", 
      name: user.name, 
      role: user.role || "user", 
      package: user.package || "basic", 
      downloadCount: user.downloadCount || 0 
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, "users", id));
      
      // Sync to GAS
      await apiCall(`/api/admin/users/${id}`, {
        method: "DELETE"
      });
      
      setDeleteConfirmId(null);
    } catch (err) {
      alert("Gagal menghapus user");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Manajemen User & Pembeli</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              window.open('/api/admin/download-html', '_blank');
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
            title="Download file HTML ini untuk di-upload ke Google Apps Script"
          >
            <Download className="w-4 h-4" />
            Download HTML untuk GAS
          </button>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showAddForm) {
                setEditingUser(null);
                setNewUser({ email: "", password: "", name: "", role: "user", package: "basic", downloadCount: 0 });
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
          >
            <UserPlus className="w-4 h-4" />
            {showAddForm ? "Tutup Form" : "Tambah Pembeli Baru"}
          </button>
        </div>
      </div>

      {showAddForm && (
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleAddUser}
          className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-4"
        >
          <h3 className="font-bold text-blue-600">{editingUser ? "Edit User" : "Tambah User Baru"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Nama Lengkap</label>
              <input
                required
                className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
              <input
                required
                type="email"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Password {editingUser && "(Kosongkan jika tidak diubah)"}</label>
              <input
                required={!editingUser}
                type="password"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Role</label>
              <select
                className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "admin" | "user" })}
              >
                <option value="user">User (Pembeli)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Paket</label>
              <select
                className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.package}
                onChange={(e) => setNewUser({ ...newUser, package: e.target.value as "basic" | "premium" })}
              >
                <option value="basic">Basic (Limit 25 Download)</option>
                <option value="premium">Premium (Unlimited)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Jumlah Download</label>
              <input
                type="number"
                className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                value={newUser.downloadCount}
                onChange={(e) => setNewUser({ ...newUser, downloadCount: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setEditingUser(null);
                setNewUser({ email: "", password: "", name: "", role: "user", package: "basic", downloadCount: 0 });
              }}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessing ? "Memproses..." : editingUser ? "Update User" : "Simpan User"}
            </button>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Nama</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Email</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Paket</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Download</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Memuat data user...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400">Belum ada user terdaftar.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-all">
                  <td className="px-6 py-4 font-medium text-slate-700">{u.name}</td>
                  <td className="px-6 py-4 text-slate-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      u.package === "premium" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-600"
                    }`}>
                      {u.package || "basic"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {u.downloadCount || 0} {u.package === "premium" ? "(Unlimited)" : "/ 25"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {deleteConfirmId === u.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={isProcessing}
                            className="bg-red-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-red-700 disabled:opacity-50"
                          >
                            Ya, Hapus
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-[10px] font-bold hover:bg-slate-300"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(u)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Edit User"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(u.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Hapus User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Login = ({ onToggleRegister }: { onToggleRegister: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError("Gagal masuk dengan Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const trimmedEmail = email.trim();

    // Check for demo accounts that only exist in the mock server
    if (trimmedEmail === 'admin@guruai.id' || trimmedEmail === 'guru@sekolah.id') {
      setError("Akun demo ini hanya untuk simulasi server. Silakan daftar akun baru atau gunakan Google Login untuk akses penuh.");
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Email atau password salah. Pastikan email sudah terdaftar atau gunakan Google Login.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Format email tidak valid.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("Metode login Email/Password belum diaktifkan di Firebase Console.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Terlalu banyak percobaan masuk. Silakan coba lagi nanti.");
      } else {
        setError(`Gagal masuk: ${err.message || "Silakan coba lagi."}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200"
      >
        <div className="bg-blue-600 p-8 text-white text-center">
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Modul Super App</h1>
          <p className="text-blue-100 text-sm mt-1">Platform Pembuat Modul Ajar Otomatis</p>
        </div>
        
        <div className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Masuk dengan Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-500">Atau masuk dengan email</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Email</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Password</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Masuk ke Dashboard
            </button>
          </form>
          
          <div className="text-center space-y-4">
            <p className="text-xs text-slate-400">
              Akses eksklusif untuk 1 akun per user.
            </p>
            <button 
              type="button"
              onClick={onToggleRegister}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Belum punya akun? Daftar di sini
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Register = ({ onToggleLogin }: { onToggleLogin: () => void }) => {
  const [formData, setFormData] = useState({
    email: "",
    nama: "",
    nip: "",
    kode: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // 0. Validate activation code in GAS
      const validateRes = await apiCall("/api/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kode: formData.kode.trim() })
      });
      if (!validateRes.success) {
        setError(validateRes.message);
        setLoading(false);
        return;
      }

      // 1. Create Firebase Auth User
      const trimmedEmail = formData.email.trim();
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, formData.password);
      const firebaseUser = userCredential.user;

      // 2. Create Firestore User Doc
      const newUser: User = {
        id: firebaseUser.uid,
        email: trimmedEmail,
        name: formData.nama.trim(),
        role: "user",
        package: "basic",
        downloadCount: 0,
        nip: formData.nip.trim()
      };
      await setDoc(doc(db, "users", firebaseUser.uid), newUser);

      // 3. Sync to GAS (keeping the original logic for spreadsheet)
      await apiCall("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: firebaseUser.uid,
          email: trimmedEmail,
          nama: formData.nama.trim(),
          nip: formData.nip.trim(),
          kode: formData.kode.trim(),
          password: formData.password
        })
      });
      
      setSuccess("Akun berhasil dibuat! Silakan masuk.");
      setFormData({ email: "", nama: "", nip: "", kode: "", password: "" });
    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Metode pendaftaran Email/Password belum diaktifkan di Firebase Console. Silakan hubungi admin atau aktifkan di Authentication > Sign-in method.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Email sudah terdaftar.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password terlalu lemah.");
      } else {
        setError(`Terjadi kesalahan: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200"
      >
        <div className="bg-blue-600 p-8 text-white text-center">
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <UserPlus className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Daftar Akun Baru</h1>
          <p className="text-blue-100 text-sm mt-1">Lengkapi data untuk akses Modul Super App</p>
        </div>
        
        <div className="p-8 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 text-green-600 p-4 rounded-lg text-sm flex flex-col gap-2 border border-green-100">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                Berhasil!
              </div>
              <p className="bg-white p-2 rounded border border-green-200">
                {success}
              </p>
            </div>
          )}

          <button
            onClick={async () => {
              setLoading(true);
              setError("");
              try {
                await signInWithPopup(auth, googleProvider);
              } catch (err) {
                setError("Gagal daftar dengan Google.");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Daftar dengan Google
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-500">Atau daftar dengan email</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Email Aktif</label>
              <input
                type="email"
                required
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                placeholder="nama@email.com"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Nama Lengkap & Gelar</label>
            <input
              type="text"
              required
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="Contoh: Budi Santoso, S.Pd."
              value={formData.nama}
              onChange={(e) => setFormData({...formData, nama: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">NIP (Opsional)</label>
            <input
              type="text"
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="Masukkan NIP jika ada"
              value={formData.nip}
              onChange={(e) => setFormData({...formData, nip: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="Minimal 6 karakter"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Kode Aktivasi / Lisensi</label>
              <a 
                href={`https://wa.me/${import.meta.env.VITE_ADMIN_WHATSAPP || '6281234567890'}?text=Halo%20Admin,%20saya%20ingin%20mendapatkan%20kode%20aktivasi%20Modul%20Super%20App.`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-600 hover:underline font-bold"
              >
                Belum punya kode? Hubungi Admin
              </a>
            </div>
            <input
              type="text"
              required
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              placeholder="Masukkan kode dari admin"
              value={formData.kode}
              onChange={(e) => setFormData({...formData, kode: e.target.value})}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
            Daftar Sekarang
          </button>
          
          <div className="text-center pt-2">
            <button 
              type="button"
              onClick={onToggleLogin}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Sudah punya akun? Masuk di sini
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  </div>
);
};

const Dashboard = ({ user: initialUser, onLogout }: { user: User; onLogout: () => void }) => {
  const [user, setUser] = useState<User>(initialUser);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const [activeTab, setActiveTab] = useState<"input" | "admin" | "preview" | "users">("input");
  const [isDownloading, setIsDownloading] = useState(false);
  const [formData, setFormData] = useState<ModuleData>({
    teacherName: user.name,
    nip: localStorage.getItem(`nip_${user.id}`) || "",
    subject: localStorage.getItem(`subject_${user.id}`) || "",
    level: localStorage.getItem(`level_${user.id}`) || "",
    className: localStorage.getItem(`class_${user.id}`) || "",
    phase: localStorage.getItem(`phase_${user.id}`) || "",
    year: localStorage.getItem(`year_${user.id}`) || "",
    topic: "",
    learningObjectives: "",
    model: "Problem Based Learning (PBL)",
    characters: [],
    schoolName: localStorage.getItem(`school_${user.id}`) || "",
    allocation: localStorage.getItem(`alloc_${user.id}`) || "",
    location: localStorage.getItem(`loc_${user.id}`) || "",
    date: "",
    principalName: localStorage.getItem(`p_name_${user.id}`) || "",
    principalNip: localStorage.getItem(`p_nip_${user.id}`) || "",
    isNipLocked: !!localStorage.getItem(`nip_locked_${user.id}`),
    isPrincipalLocked: !!localStorage.getItem(`p_locked_${user.id}`),
    isSchoolLocked: !!localStorage.getItem(`school_locked_${user.id}`),
    isSubjectLocked: !!localStorage.getItem(`subject_locked_${user.id}`),
    isLevelLocked: !!localStorage.getItem(`level_locked_${user.id}`),
    isClassLocked: !!localStorage.getItem(`class_locked_${user.id}`),
    isYearLocked: !!localStorage.getItem(`year_locked_${user.id}`),
    isLocationLocked: !!localStorage.getItem(`loc_locked_${user.id}`),
    isAllocationLocked: !!localStorage.getItem(`alloc_locked_${user.id}`),
    applyLoveCurriculum: false,
  });

  useEffect(() => {
    if (formData.isNipLocked) {
      localStorage.setItem(`nip_${user.id}`, formData.nip);
      localStorage.setItem(`nip_locked_${user.id}`, "true");
    } else {
      localStorage.removeItem(`nip_locked_${user.id}`);
    }
  }, [formData.isNipLocked, formData.nip, user.id]);

  useEffect(() => {
    if (formData.isPrincipalLocked) {
      localStorage.setItem(`p_name_${user.id}`, formData.principalName);
      localStorage.setItem(`p_nip_${user.id}`, formData.principalNip);
      localStorage.setItem(`p_locked_${user.id}`, "true");
    } else {
      localStorage.removeItem(`p_locked_${user.id}`);
    }
  }, [formData.isPrincipalLocked, formData.principalName, formData.principalNip, user.id]);
  useEffect(() => {
    const locks = [
      { key: 'school', locked: formData.isSchoolLocked, value: formData.schoolName },
      { key: 'subject', locked: formData.isSubjectLocked, value: formData.subject },
      { key: 'level', locked: formData.isLevelLocked, value: formData.level },
      { key: 'class', locked: formData.isClassLocked, value: formData.className },
      { key: 'phase', locked: formData.isClassLocked, value: formData.phase },
      { key: 'year', locked: formData.isYearLocked, value: formData.year },
      { key: 'loc', locked: formData.isLocationLocked, value: formData.location },
      { key: 'alloc', locked: formData.isAllocationLocked, value: formData.allocation },
    ];

    locks.forEach(lock => {
      if (lock.locked) {
        localStorage.setItem(`${lock.key}_${user.id}`, lock.value);
        localStorage.setItem(`${lock.key}_locked_${user.id}`, "true");
      } else {
        localStorage.removeItem(`${lock.key}_locked_${user.id}`);
      }
    });
  }, [formData, user.id]);

  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [suggestedObjectives, setSuggestedObjectives] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSuggestingObjectives, setIsSuggestingObjectives] = useState(false);
  const [generatedModule, setGeneratedModule] = useState<GeneratedModule | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const pppCharacters = [
    "Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia",
    "Berkebinekaan Global",
    "Bergotong Royong",
    "Mandiri",
    "Bernalar Kritis",
    "Kreatif"
  ];

  const educationLevels = {
    "SD": {
      classes: ["Kelas 1", "Kelas 2", "Kelas 3", "Kelas 4", "Kelas 5", "Kelas 6"],
      phases: {
        "Kelas 1": "A",
        "Kelas 2": "A",
        "Kelas 3": "B",
        "Kelas 4": "B",
        "Kelas 5": "C",
        "Kelas 6": "C"
      }
    },
    "SMP": {
      classes: ["Kelas 7", "Kelas 8", "Kelas 9"],
      phases: {
        "Kelas 7": "D",
        "Kelas 8": "D",
        "Kelas 9": "D"
      }
    },
    "SMA": {
      classes: ["Kelas 10", "Kelas 11", "Kelas 12"],
      phases: {
        "Kelas 10": "E",
        "Kelas 11": "F",
        "Kelas 12": "F"
      }
    },
    "SMK": {
      classes: ["Kelas 10", "Kelas 11", "Kelas 12"],
      phases: {
        "Kelas 10": "E",
        "Kelas 11": "F",
        "Kelas 12": "F"
      }
    }
  };

  const isInputComplete = () => {
    const requiredFields = [
      formData.schoolName,
      formData.subject,
      formData.level,
      formData.className,
      formData.year,
      formData.location,
      formData.date
    ];
    
    const allFieldsFilled = requiredFields.every(field => !!field);
    const nipValid = formData.isNipLocked || !!formData.nip;
    const principalValid = formData.isPrincipalLocked || (!!formData.principalName && !!formData.principalNip);
    
    return allFieldsFilled && nipValid && principalValid;
  };

  const handleTabChange = (tab: "input" | "admin" | "preview" | "users") => {
    // Selalu izinkan kembali ke Input Data
    if (tab === "input") {
      setActiveTab(tab);
      setIsSidebarOpen(false);
      return;
    }

    // Khusus Admin: Selalu izinkan akses ke Manajemen User tanpa validasi form input
    if (tab === "users" && user.role === "admin") {
      setActiveTab(tab);
      setIsSidebarOpen(false);
      return;
    }

    // Validasi untuk tab lain (Administrasi & Preview)
    if (!isInputComplete()) {
      alert("Mohon lengkapi semua data pada menu Input Data terlebih dahulu (tanda merah 'data harus diisi').");
      return;
    }
    
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const handleLevelChange = (level: string) => {
    const classes = educationLevels[level as keyof typeof educationLevels]?.classes || [];
    const firstClass = classes[0] || "";
    const phase = educationLevels[level as keyof typeof educationLevels]?.phases[firstClass as keyof typeof educationLevels["SD"]["phases"]] || "";
    
    setFormData({ 
      ...formData, 
      level, 
      className: firstClass,
      phase: phase
    });
  };

  const handleClassChange = (className: string) => {
    const phase = educationLevels[formData.level as keyof typeof educationLevels]?.phases[className as keyof typeof educationLevels["SD"]["phases"]] || "";
    setFormData({ ...formData, className, phase });
  };

  const handleGetSuggestions = async () => {
    if (!formData.subject || !formData.level || !formData.phase) {
      alert("Lengkapi Mapel, Jenjang, dan Fase terlebih dahulu.");
      return;
    }
    setIsSuggesting(true);
    try {
      const topics = await suggestTopics(formData.subject, formData.level, formData.phase);
      setSuggestedTopics(topics);
    } catch (err: any) {
      alert(`Gagal mendapatkan saran topik: ${err.message || "Terjadi kesalahan"}`);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleGetObjectives = async () => {
    if (!formData.subject || !formData.topic || !formData.level || !formData.phase) {
      alert("Lengkapi Mapel, Topik, Jenjang, dan Fase terlebih dahulu.");
      return;
    }
    setIsSuggestingObjectives(true);
    try {
      const objectives = await suggestObjectives(
        formData.subject, 
        formData.topic, 
        formData.level, 
        formData.phase,
        formData.model,
        formData.applyLoveCurriculum
      );
      setSuggestedObjectives(objectives);
    } catch (err: any) {
      alert(`Gagal mendapatkan saran tujuan pembelajaran: ${err.message || "Terjadi kesalahan"}`);
    } finally {
      setIsSuggestingObjectives(false);
    }
  };

  const handleGenerate = async () => {
    if (!formData.topic) {
      alert("Pilih atau isi Materi Pokok terlebih dahulu.");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateModulAjar(formData);
      setGeneratedModule(result);
      setActiveTab("preview");

      // Sync to Firestore
      const moduleRef = doc(collection(db, "modules"));
      await setDoc(moduleRef, {
        userId: user.id,
        subject: formData.subject,
        level: formData.level,
        topic: formData.topic,
        school: formData.schoolName,
        teacher: formData.teacherName,
        location: formData.location,
        date: formData.date,
        principal: formData.principalName,
        content: result,
        createdAt: new Date().toISOString()
      });

      // Sync to Google Sheets via internal proxy
      apiCall("/api/save-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          subject: formData.subject,
          level: formData.level,
          topic: formData.topic,
          school: formData.schoolName,
          teacher: formData.teacherName,
          location: formData.location,
          date: formData.date,
          principal: formData.principalName,
          content: result
        }),
      })
      .then(data => console.log("Module sync result:", data))
      .catch(e => console.error("GAS Sync Error:", e));
    } catch (err: any) {
      console.error("Generation error:", err);
      alert(`Gagal membuat modul: ${err.message || "Terjadi kesalahan"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCharacter = (char: string) => {
    setFormData(prev => ({
      ...prev,
      characters: prev.characters.includes(char)
        ? prev.characters.filter(c => c !== char)
        : [...prev.characters, char]
    }));
  };

  const downloadPDF = async () => {
    if (user.package === "basic" && (user.downloadCount || 0) >= 25) {
      alert("Batas download paket Basic (25 kali) telah tercapai. Silakan hubungi Admin via WhatsApp untuk upgrade ke paket Premium agar bisa download tanpa batas.");
      window.open(`https://wa.me/${import.meta.env.VITE_ADMIN_WHATSAPP || '6281234567890'}?text=Halo%20Admin,%20kuota%20download%20Basic%20saya%20sudah%20habis.%20Saya%20ingin%20upgrade%20ke%20Premium.`, '_blank');
      return;
    }

    const element = document.getElementById("module-content");
    if (!element) {
      alert("Konten modul tidak ditemukan.");
      return;
    }
    
    setIsDownloading(true);
    element.classList.add("generating-pdf");
    
    try {
      console.log("Starting PDF generation with html2pdf...");
      
      const fileName = `Modul_Ajar_${(formData.topic || "Tanpa_Judul").replace(/\s+/g, "_")}.pdf`;
      
      const opt = {
        margin: 0,
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true,
          backgroundColor: '#ffffff',
          logging: false,
          width: 794
        },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
        pagebreak: { mode: ['css', 'legacy'] as any }
      };

      // Use html2pdf for better page break handling and layout
      await html2pdf().set(opt).from(element).save();
      
      console.log("PDF saved successfully:", fileName);
      
      // Update download count in Firestore
      const userRef = doc(db, "users", user.id);
      const newDownloadCount = (user.downloadCount || 0) + 1;
      await updateDoc(userRef, {
        downloadCount: newDownloadCount
      });

      // Update download count in GAS
      try {
        const data = await apiCall(`/api/users/${user.id}/download`, { 
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (data.success) {
          const updatedUser = { ...user, downloadCount: newDownloadCount };
          setUser(updatedUser);
          console.log("Download count updated in both Firestore and GAS");
        }
      } catch (err) {
        console.error("Failed to sync download count to GAS:", err);
        // Still update local state if Firestore succeeded
        const updatedUser = { ...user, downloadCount: newDownloadCount };
        setUser(updatedUser);
      }
    } catch (err) {
      console.error("PDF Download Error:", err);
      alert("Gagal mengunduh PDF. Pastikan koneksi internet stabil dan coba lagi.");
    } finally {
      element.classList.remove("generating-pdf");
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 text-blue-600">
          <Sparkles className="w-6 h-6" />
          <span className="text-lg font-bold">Modul Super App</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600">
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:sticky top-0 z-40 w-64 h-screen bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out`}>
        <div className="p-6 border-b border-slate-100 hidden md:block">
          <div className="flex items-center gap-3 text-blue-600 mb-8">
            <Sparkles className="w-8 h-8" />
            <span className="text-xl font-bold tracking-tight">Modul Super App</span>
          </div>
        </div>
        
        <div className="p-6 flex-1">
          <nav className="space-y-2">
            <button
              onClick={() => handleTabChange("input")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "input" ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <FilePlus className="w-5 h-5" />
              Input Data
            </button>
            <button
              onClick={() => handleTabChange("admin")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "admin" ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Settings className="w-5 h-5" />
              Administrasi
            </button>
            <button
              onClick={() => handleTabChange("preview")}
              disabled={!generatedModule}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "preview" ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 disabled:opacity-30"
              }`}
            >
              <FileText className="w-5 h-5" />
              Preview & PDF
            </button>
            {user.role === "admin" && (
              <button
                onClick={() => handleTabChange("users")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === "users" ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Users className="w-5 h-5" />
                Manajemen User
              </button>
            )}
          </nav>
        </div>
        
        <div className="mt-auto p-6 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-700 truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </div>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 relative">
        {/* Elegant Account Status in Top Right */}
        {user.role !== "admin" && (
          <div className="hidden md:flex absolute top-8 right-8 items-center gap-4 z-10">
            <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 shadow-sm backdrop-blur-sm ${
              user.package === 'premium' ? 'bg-amber-50/80 border-amber-100' : 'bg-white/80 border-slate-200'
            }`}>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Status Akun</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black uppercase ${user.package === 'premium' ? 'text-amber-600' : 'text-slate-700'}`}>
                    {user.package || 'BASIC'}
                  </span>
                  <div className="w-px h-3 bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-500">
                    {user.downloadCount || 0} / {user.package === 'premium' ? '∞' : '25'}
                  </span>
                </div>
              </div>
              {user.package === 'premium' ? (
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <Sparkles className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === "input" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <header>
                  <h2 className="text-3xl font-bold text-slate-800">Input Data Guru & Mapel</h2>
                  <p className="text-slate-500 mt-2">Lengkapi data dasar untuk memulai penyusunan modul.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Nama Guru</label>
                    <input
                      readOnly
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed outline-none"
                      value={formData.teacherName}
                    />
                    <p className="text-[10px] text-slate-400 font-medium mt-1 italic">*Nama guru terkunci sesuai profil akun</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">NIP Guru</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isNipLocked: !formData.isNipLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isNipLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isNipLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isNipLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <input
                      readOnly={formData.isNipLocked}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isNipLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      placeholder="Masukkan NIP"
                      value={formData.nip}
                      onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    />
                    {!formData.nip && !formData.isNipLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Nama Sekolah</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isSchoolLocked: !formData.isSchoolLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isSchoolLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isSchoolLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isSchoolLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <input
                      readOnly={formData.isSchoolLocked}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isSchoolLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      placeholder="Contoh: SD Negeri 01 Jakarta"
                      value={formData.schoolName}
                      onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                    />
                    {!formData.schoolName && !formData.isSchoolLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Mata Pelajaran</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isSubjectLocked: !formData.isSubjectLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isSubjectLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isSubjectLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isSubjectLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <input
                      readOnly={formData.isSubjectLocked}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isSubjectLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      placeholder="Contoh: Matematika"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    />
                    {!formData.subject && !formData.isSubjectLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Jenjang</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isLevelLocked: !formData.isLevelLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isLevelLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isLevelLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isLevelLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <select
                      disabled={formData.isLevelLocked}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isLevelLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      value={formData.level}
                      onChange={(e) => handleLevelChange(e.target.value)}
                    >
                      <option value="">Pilih Jenjang</option>
                      {Object.keys(educationLevels).map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                    {!formData.level && !formData.isLevelLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Kelas</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isClassLocked: !formData.isClassLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isClassLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isClassLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isClassLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <select
                      disabled={formData.isClassLocked || !formData.level}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isClassLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      value={formData.className}
                      onChange={(e) => handleClassChange(e.target.value)}
                    >
                      <option value="">Pilih Kelas</option>
                      {formData.level && educationLevels[formData.level as keyof typeof educationLevels]?.classes.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {!formData.className && !formData.isClassLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Fase Kurikulum</label>
                    <input
                      readOnly
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed outline-none"
                      value={formData.phase ? `Fase ${formData.phase}` : ""}
                      placeholder="Fase akan terisi otomatis"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Tahun Pelajaran</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isYearLocked: !formData.isYearLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isYearLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isYearLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isYearLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <input
                      readOnly={formData.isYearLocked}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isYearLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      placeholder="Contoh: 2024/2025"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    />
                    {!formData.year && !formData.isYearLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Tempat Pengisian</label>
                      <button 
                        onClick={() => setFormData({ ...formData, isLocationLocked: !formData.isLocationLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isLocationLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isLocationLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isLocationLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <input
                      readOnly={formData.isLocationLocked}
                      className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isLocationLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                      placeholder="Contoh: Jakarta"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                    {!formData.location && !formData.isLocationLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Tanggal Pengisian</label>
                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Contoh: 29 Maret 2026"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                    {!formData.date && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                  <div className="space-y-2 md:col-span-2 border-t border-slate-100 pt-4 mt-2">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-slate-800">Data Kepala Sekolah</h4>
                      <button 
                        onClick={() => setFormData({ ...formData, isPrincipalLocked: !formData.isPrincipalLocked })}
                        className={`text-xs flex items-center gap-1 font-bold ${formData.isPrincipalLocked ? 'text-blue-600' : 'text-slate-400'}`}
                      >
                        {formData.isPrincipalLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {formData.isPrincipalLocked ? 'Terkunci' : 'Kunci'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Nama Kepala Sekolah</label>
                        <input
                          readOnly={formData.isPrincipalLocked}
                          className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isPrincipalLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                          placeholder="Nama Kepala Sekolah"
                          value={formData.principalName}
                          onChange={(e) => setFormData({ ...formData, principalName: e.target.value })}
                        />
                        {!formData.principalName && !formData.isPrincipalLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">NIP Kepala Sekolah</label>
                        <input
                          readOnly={formData.isPrincipalLocked}
                          className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isPrincipalLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                          placeholder="NIP Kepala Sekolah"
                          value={formData.principalNip}
                          onChange={(e) => setFormData({ ...formData, principalNip: e.target.value })}
                        />
                        {!formData.principalNip && !formData.isPrincipalLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleTabChange("admin")}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3"
                >
                  Lanjutkan ke Administrasi
                  <Sparkles className="w-6 h-6" />
                </button>
              </motion.div>
            )}

            {activeTab === "admin" && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <header>
                  <h2 className="text-3xl font-bold text-slate-800">Administrasi & Credit</h2>
                  <p className="text-slate-500 mt-2">Cek status paket Anda dan lengkapi strategi pembelajaran.</p>
                </header>

                <div className="grid grid-cols-1 gap-6">
                  <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-8">
                    {/* Tombol Kembali */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setActiveTab("input")}
                        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-all text-sm font-medium"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Kembali ke Input Data
                      </button>
                    </div>

                    <div className="space-y-6">
                      {/* Status Paket & Upgrade */}
                      <div className="p-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30 flex flex-col items-center text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                          <Sparkles className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-slate-800">Status Paket: <span className="text-blue-600 uppercase">{user.package || 'BASIC'}</span></h4>
                          <p className="text-sm text-slate-500 mt-1">
                            {user.package === 'premium' 
                              ? "Selamat! Anda memiliki akses download tanpa batas." 
                              : `Anda telah menggunakan ${user.downloadCount || 0} dari 25 kuota download gratis.`}
                          </p>
                        </div>
                        {user.package !== 'premium' && (
                          <a 
                            href={`https://wa.me/${import.meta.env.VITE_ADMIN_WHATSAPP || '6281234567890'}?text=Halo%20Admin,%20saya%20ingin%20upgrade%20akun%20Modul%20Super%20App%20saya%20ke%20Premium.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
                          >
                            Upgrade ke Premium
                            <ChevronLeft className="w-4 h-4 rotate-180" />
                          </a>
                        )}
                      </div>

                      <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800">Kurikulum Berbasis Cinta</h4>
                            <p className="text-xs text-slate-500">Pendekatan humanis dalam modul ajar.</p>
                          </div>
                        </div>
                        
                        <label className="flex items-start gap-3 p-4 bg-white rounded-xl border border-blue-100 cursor-pointer hover:bg-blue-50/50 transition-all group">
                          <div className="relative flex items-center">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={formData.applyLoveCurriculum}
                              onChange={(e) => setFormData({ ...formData, applyLoveCurriculum: e.target.checked })}
                            />
                            <div className="w-5 h-5 border-2 border-slate-200 rounded-md peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all" />
                            <CheckCircle2 className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 left-1 transition-all" />
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-all">Terapkan Kurikulum Berbasis Cinta</span>
                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                              Jika diaktifkan, AI akan menyisipkan nilai-nilai kasih sayang, empati, dan pendekatan humanis dalam setiap langkah pembelajaran di modul ini.
                            </p>
                          </div>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-slate-700">Model Pembelajaran</label>
                          <select
                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                            value={formData.model}
                            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                          >
                            <option>Problem Based Learning (PBL)</option>
                            <option>Project Based Learning (PjBL)</option>
                            <option>Discovery Learning</option>
                            <option>Inquiry Learning</option>
                            <option>Contextual Teaching and Learning (CTL)</option>
                            <option>Cooperative Learning</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-slate-700">Alokasi Waktu</label>
                            <button 
                              onClick={() => setFormData({ ...formData, isAllocationLocked: !formData.isAllocationLocked })}
                              className={`text-xs flex items-center gap-1 font-bold ${formData.isAllocationLocked ? 'text-blue-600' : 'text-slate-400'}`}
                            >
                              {formData.isAllocationLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                              {formData.isAllocationLocked ? 'Terkunci' : 'Kunci'}
                            </button>
                          </div>
                          <input
                            readOnly={formData.isAllocationLocked}
                            className={`w-full px-4 py-2 rounded-lg border border-slate-200 outline-none transition-all ${formData.isAllocationLocked ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500'}`}
                            placeholder="Contoh: 2 x 35 Menit"
                            value={formData.allocation}
                            onChange={(e) => setFormData({ ...formData, allocation: e.target.value })}
                          />
                          {!formData.allocation && !formData.isAllocationLocked && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                        </div>
                      </div>
                    </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Materi Pokok</label>
                      <button
                        onClick={handleGetSuggestions}
                        disabled={isSuggesting}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold hover:bg-blue-100 transition-all flex items-center gap-1"
                      >
                        {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Saran AI
                      </button>
                    </div>
                    
                    {suggestedTopics.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {suggestedTopics.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => setFormData({ ...formData, topic: t })}
                            className={`text-xs px-3 py-1 rounded-full border transition-all ${
                              formData.topic === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}

                    <input
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Pilih saran di atas atau ketik manual"
                      value={formData.topic}
                      onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    />
                    {!formData.topic && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Tujuan Pembelajaran</label>
                      <button
                        onClick={handleGetObjectives}
                        disabled={isSuggestingObjectives}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold hover:bg-blue-100 transition-all flex items-center gap-1"
                      >
                        {isSuggestingObjectives ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Saran AI
                      </button>
                    </div>
                    
                    {suggestedObjectives.length > 0 && (
                      <div className="space-y-2 mb-2">
                        {suggestedObjectives.map((obj, i) => (
                          <button
                            key={i}
                            onClick={() => setFormData({ ...formData, learningObjectives: formData.learningObjectives ? formData.learningObjectives + "\n" + obj : obj })}
                            className="w-full text-left text-xs p-2 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-slate-600"
                          >
                            {obj}
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                      placeholder="Masukkan tujuan pembelajaran atau gunakan saran AI"
                      value={formData.learningObjectives}
                      onChange={(e) => setFormData({ ...formData, learningObjectives: e.target.value })}
                    />
                    {!formData.learningObjectives && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-semibold text-slate-700">Karakter yang Diharapkan (Profil Pelajar Pancasila)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {pppCharacters.map((char) => (
                        <label 
                          key={char}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            formData.characters.includes(char) ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                            checked={formData.characters.includes(char)}
                            onChange={() => toggleCharacter(char)}
                          />
                          <span className="text-sm font-medium">{char}</span>
                        </label>
                      ))}
                    </div>
                    {formData.characters.length === 0 && <p className="text-[10px] text-red-500 font-bold mt-1">data harus diisi</p>}
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !formData.topic}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Sedang Menyusun Modul...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6" />
                      Generate Modul Ajar (AI)
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

            {activeTab === "preview" && generatedModule && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8"
              >
                <header>
                  <h2 className="text-3xl font-bold text-slate-800">Preview & Download</h2>
                  <p className="text-slate-500 mt-2">Tinjau modul yang telah disusun dan unduh dalam format PDF.</p>
                </header>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setActiveTab("admin")}
                      className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-all text-sm font-medium"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Kembali
                    </button>
                  </div>
                  
                  <div className="flex justify-center">
                    <button
                      onClick={downloadPDF}
                      disabled={isDownloading}
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all shadow-lg shadow-blue-200 disabled:opacity-50 transform hover:scale-105 active:scale-95"
                    >
                      {isDownloading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Download className="w-6 h-6" />}
                      {isDownloading ? "Sedang Memproses PDF..." : "Download Modul Ajar (PDF)"}
                    </button>
                  </div>
                </div>

                  <div className="overflow-x-auto pb-8 bg-slate-100 rounded-2xl p-4 md:p-8">
                    <div 
                      id="module-content"
                      className={`pdf-page shadow-2xl border border-slate-200 prose prose-slate max-w-none text-[12pt] leading-relaxed ${user.package === 'basic' ? 'select-none' : ''}`}
                    >
                    <div className="text-center border-b-2 border-slate-800 pb-6 mb-8">
                      <h1 className="text-2xl font-bold uppercase m-0 tracking-wider">MODUL AJAR {formData.subject}</h1>
                      <h2 className="text-lg font-bold uppercase mt-1 mb-0 opacity-80">KURIKULUM MERDEKA - FASE {formData.phase} / {formData.className}</h2>
                      <p className="text-lg font-semibold m-0 mt-3 text-slate-700">{formData.schoolName}</p>
                      <p className="text-sm font-medium m-0 mt-1 italic text-slate-500">Tahun Pelajaran: {formData.year}</p>
                    </div>

                    <section className="mb-8">
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                        <div className="space-y-2 text-base">
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Nama Guru</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.teacherName}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">NIP</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.nip || "-"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Nama Sekolah</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.schoolName}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Mata Pelajaran</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.subject}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Kelas / Fase</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.className} / {formData.phase}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Materi Pokok</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.topic}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Alokasi Waktu</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.allocation}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-bold w-40 shrink-0">Tahun Pelajaran</span>
                            <span className="shrink-0">:</span>
                            <span className="flex-1">{formData.year}</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="mb-8">
                      <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">I. PROFIL PELAJAR PANCASILA</h3>
                      <div className="bg-[#f8fbff] p-4 rounded-lg border border-[#eef4ff]">
                        <ReactMarkdown>{generatedModule.profilPancasila}</ReactMarkdown>
                      </div>
                    </section>

                  <section className="mb-8 section-break">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">II. SARANA DAN PRASARANA</h3>
                    <ReactMarkdown>{generatedModule.saranaPrasarana}</ReactMarkdown>
                  </section>

                  <section className="mb-8">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">III. TARGET PESERTA DIDIK</h3>
                    <ReactMarkdown>{generatedModule.targetPesertaDidik}</ReactMarkdown>
                  </section>

                  <section className="mb-8">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">IV. MODEL & METODE PEMBELAJARAN</h3>
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <p className="m-0 font-bold">Model: {formData.model}</p>
                      <ReactMarkdown>{generatedModule.modelMetode}</ReactMarkdown>
                    </div>
                  </section>

                  <section className="mb-8 section-break">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">V. TUJUAN PEMBELAJARAN</h3>
                    <div className="bg-[#f8fbff] p-4 rounded-lg border border-[#eef4ff]">
                      <ReactMarkdown>{generatedModule.tujuanPembelajaran}</ReactMarkdown>
                    </div>
                  </section>

                  <section className="mb-8">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">VI. PEMAHAMAN BERMAKNA</h3>
                    <ReactMarkdown>{generatedModule.pemahamanBermakna}</ReactMarkdown>
                  </section>

                  <section className="mb-8">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">VII. PERTANYAAN PEMANTIK</h3>
                    <ReactMarkdown>{generatedModule.pertanyaanPemantik}</ReactMarkdown>
                  </section>

                  <section className="mb-8 section-break allow-break">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">VIII. KEGIATAN PEMBELAJARAN</h3>
                    <div className="prose prose-slate max-w-none prose-headings:text-blue-600 prose-headings:font-bold prose-p:text-slate-600 prose-strong:text-slate-800 prose-table:border prose-table:border-slate-200 prose-th:bg-slate-50 prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-slate-100">
                      <ReactMarkdown>{generatedModule.kegiatanPembelajaran}</ReactMarkdown>
                    </div>
                  </section>

                  <section className="mb-8 section-break">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">IX. ASESMEN / PENILAIAN</h3>
                    <div className="space-y-4">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <h4 className="font-bold m-0 text-sm">Asesmen Diagnostik</h4>
                        <ReactMarkdown>{generatedModule.asesmenDiagnostik}</ReactMarkdown>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <h4 className="font-bold m-0 text-sm">Asesmen Formatif</h4>
                        <ReactMarkdown>{generatedModule.asesmenFormatif}</ReactMarkdown>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <h4 className="font-bold m-0 text-sm">Asesmen Sumatif</h4>
                        <ReactMarkdown>{generatedModule.asesmenSumatif}</ReactMarkdown>
                      </div>
                    </div>
                  </section>

                  <section className="mb-8">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">X. PENGAYAAN DAN REMEDIAL</h3>
                    <ReactMarkdown>{generatedModule.pengayaanRemedial}</ReactMarkdown>
                  </section>

                  <section className="mb-8">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">XI. REFLEKSI GURU & PESERTA DIDIK</h3>
                    <ReactMarkdown>{generatedModule.refleksi}</ReactMarkdown>
                  </section>

                  <section className="mb-8 section-break">
                    <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">XII. LAMPIRAN</h3>
                    <ReactMarkdown>{generatedModule.lampiran}</ReactMarkdown>
                  </section>

                  <div className="mt-16 grid grid-cols-2 gap-12 text-center">
                    <div className="flex flex-col items-center">
                      <p className="mb-4">Mengetahui,<br />Kepala Sekolah</p>
                      <div className="mt-8">
                        <p className="font-bold underline m-0 signature-name">{formData.principalName || "................................................"}</p>
                        <p className="m-0 text-sm signature-nip">NIP. {formData.principalNip || "................................................"}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center">
                      <p className="mb-4">{formData.location}, {formData.date}<br />Guru Mata Pelajaran</p>
                      <div className="mt-8">
                        <p className="font-bold underline m-0 signature-name">{formData.teacherName}</p>
                        <p className="m-0 text-sm signature-nip">NIP. {formData.nip || "-"}</p>
                      </div>
                    </div>
                  </div>

                  {generatedModule.lkpd && (
                    <section className="mt-16 pt-8 border-t-2 border-slate-200 section-break allow-break">
                      <h3 className="text-xl font-bold border-l-4 border-blue-600 pl-3 mb-4">XIII. LAMPIRAN LKPD</h3>
                      <div className="bg-white p-4 rounded-lg border border-slate-100">
                        <ReactMarkdown>{generatedModule.lkpd}</ReactMarkdown>
                      </div>
                    </section>
                  )}
                </div>
              </div>
              </motion.div>
            )}
            {activeTab === "users" && user.role === "admin" && (
              <motion.div
                key="users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <UserManagement />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Get user data from Firestore
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data() as User;
          // Force admin role if email matches
          if (firebaseUser.email === "mahardikasandy1992@gmail.com" && userData.role !== "admin") {
            const updatedUser = { ...userData, role: "admin" as const };
            await updateDoc(userRef, { role: "admin" });
            setUser({ id: firebaseUser.uid, ...updatedUser });
          } else {
            setUser({ id: firebaseUser.uid, ...userData });
          }
        } else {
          // If user doesn't exist in Firestore but is authenticated (e.g. first time Google Login)
          const isAdminEmail = firebaseUser.email === "mahardikasandy1992@gmail.com";
          const newUser: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            name: firebaseUser.displayName || "User",
            role: isAdminEmail ? "admin" : "user",
            package: isAdminEmail ? "premium" : "basic",
            downloadCount: 0
          };
          await setDoc(userRef, newUser);
          setUser(newUser);
          
          // Sync to GAS
          await apiCall("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newUser),
          });
        }
      } else {
        setUser(null);
      }
      setIsReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (!isReady) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="font-sans text-slate-900">
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : isRegistering ? (
        <Register onToggleLogin={() => setIsRegistering(false)} />
      ) : (
        <Login onToggleRegister={() => setIsRegistering(true)} />
      )}
    </div>
  );
}
