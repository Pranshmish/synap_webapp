import { User, Mail, MapPin, Calendar, Phone, ArrowLeft, Edit, Save, Shield, Fingerprint } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

function Profile() {
  const navigate = useNavigate();
  const { user: firebaseUser } = useAuth();

  const [editMode, setEditMode] = useState(false);
  const [user, setUser] = useState({
    name: "",
    email: "",
    gender: "",
    phone: "",
    address: "",
    dob: "",
    age: "",
  });

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("userProfile"));
    if (saved) {
      setUser(saved);
    } else if (firebaseUser) {
      setUser({
        name: firebaseUser.displayName || "",
        email: firebaseUser.email || "",
        phone: "",
        address: "",
        dob: "",
        age: "",
        gender: "",
      });
    }
  }, [firebaseUser]);

  const updateField = (field, value) => setUser((prev) => ({ ...prev, [field]: value }));

  const saveProfile = () => {
    localStorage.setItem("userProfile", JSON.stringify(user));
    setEditMode(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] grid-bg noise-bg">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors mb-6"
        >
          <ArrowLeft size={18} /> Back
        </button>

        {/* Profile Card */}
        <div className="card-tech p-8">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-6 mb-8">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center overflow-hidden">
                  {firebaseUser?.photoURL ? (
                    <img src={firebaseUser.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-white" />
                  )}
                </div>
                <div className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-green-500 border-2 border-slate-950 flex items-center justify-center">
                  <Shield className="w-3 h-3 text-black" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{editMode ? "Edit Profile" : "User Profile"}</h1>
                <p className="text-slate-500 text-sm">{user.gender || "Not set"} • {user.age || "N/A"} yrs</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 text-xs font-medium">OPERATOR</div>
                  <div className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs font-medium">VERIFIED</div>
                </div>
              </div>
            </div>

            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="btn-tech flex items-center gap-2"
              >
                <Edit size={16} /> Edit
              </button>
            ) : (
              <button
                onClick={saveProfile}
                className="btn-solid flex items-center gap-2"
              >
                <Save size={16} /> Save
              </button>
            )}
          </div>

          {/* Profile Fields */}
          <div className="space-y-5">
            <ProfileField icon={User} label="Full Name" value={user.name} editable={editMode} onChange={(v) => updateField("name", v)} />
            <ProfileField icon={Mail} label="Email Address" value={user.email} editable={false} locked />
            <ProfileField icon={Phone} label="Phone Number" value={user.phone} editable={editMode} onChange={(v) => updateField("phone", v)} />
            <ProfileField icon={MapPin} label="Address" value={user.address} editable={editMode} onChange={(v) => updateField("address", v)} />
            <ProfileField icon={Calendar} label="Date of Birth" value={user.dob} editable={editMode} onChange={(v) => updateField("dob", v)} />

            <div className="grid grid-cols-2 gap-4">
              <ProfileField label="Age" value={user.age} editable={editMode} onChange={(v) => updateField("age", v)} />
              <div>
                <label className="text-xs text-slate-500 tracking-wider mb-2 block">GENDER</label>
                {!editMode ? (
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 text-white">
                    {user.gender || "Not set"}
                  </div>
                ) : (
                  <select
                    className="w-full input-tech"
                    value={user.gender}
                    onChange={(e) => updateField("gender", e.target.value)}
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="card-tech p-6 mt-6">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-cyan-400" />
            Security Profile
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <div className="text-xs text-slate-500 mb-1">VOICE STATUS</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-green-400 font-medium">Enrolled</span>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <div className="text-xs text-slate-500 mb-1">2FA STATUS</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                <span className="text-cyan-400 font-medium">Active</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function ProfileField({ icon: Icon, label, value, editable, onChange, locked }) {
  return (
    <div>
      <label className="text-xs text-slate-500 tracking-wider mb-2 block flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-cyan-400/50" />}
        {label}
        {locked && <span className="text-slate-600">(Locked)</span>}
      </label>
      {!editable ? (
        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 text-white">
          {value || <span className="text-slate-600">Not set</span>}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full input-tech"
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      )}
    </div>
  );
}

export default Profile;
