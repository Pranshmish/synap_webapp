import { useEffect, useState } from "react";
import { Mail, MapPin, Send, AlertCircle, XCircle } from "lucide-react";
import emailjs from "emailjs-com";

function Contacts() {
  const [coords, setCoords] = useState(null);
  const [address, setAddress] = useState("");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("");

  // Get User Live Location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ latitude, longitude });

        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        );
        const data = await res.json();
        setAddress(data.display_name || "Address unavailable");
      });
    }
  }, []);

  // Handle sending message
  const sendEmail = (e) => {
    e.preventDefault();

    // Validation
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setStatus("⚠ Please fill in all required fields.");
      return;
    }

    setStatus("Sending...");

    emailjs
      .send(
        "service_6g0ag2p", 
        "template_lsg4asc", 
        {
          name: form.name,
          email: form.email,
          message: form.message,
          location: address,
        },
        "N-Brvr9ZJeTpucrxk"
      )
      .then(() => {
        setStatus("✅ Message sent successfully!");
        setForm({ name: "", email: "", message: "" });
      })
      .catch(() => setStatus("❌ Error sending message. Try again later."));
  };

  // Clear form
  const clearForm = () => {
    setForm({ name: "", email: "", message: "" });
    setStatus("✖ Cleared.");
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <h2 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
        Contact & Support
      </h2>

      <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-2xl">
        If you are experiencing any issues, or need technical assistance, please reach out using the form below.
      </p>

      {/* MAP SECTION */}
      <div className="bg-white dark:bg-gray-800 shadow-xl p-6 rounded-2xl mb-10">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-gray-800 dark:text-white">
          <MapPin className="text-blue-500" /> Your Location
        </h3>

        {coords ? (
          <>
            <iframe
              title="map"
              className="mt-5 w-full h-64 rounded-xl"
              src={`https://maps.google.com/maps?q=${coords.latitude},${coords.longitude}&z=15&output=embed`}
            ></iframe>

            <p className="mt-4 text-gray-700 dark:text-gray-300">
              <strong>Address:</strong> {address}
            </p>
            <p className="text-gray-500 mt-1 dark:text-gray-400">
              <strong>Coordinates:</strong> {coords.latitude}, {coords.longitude}
            </p>
          </>
        ) : (
          <p className="mt-4 text-gray-600 dark:text-gray-400">Detecting location...</p>
        )}
      </div>

      {/* CONTACT FORM */}
      <div className="bg-white dark:bg-gray-800 shadow-xl p-6 rounded-2xl">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-800 dark:text-white">
          <Mail className="text-blue-500" /> Send us a message
        </h3>

        <form onSubmit={sendEmail} className="space-y-4">
          <input
            type="text"
            placeholder="Full Name *"
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            type="email"
            placeholder="Email Address *"
            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <textarea
            placeholder="Describe your issue... *"
            className="w-full p-3 h-28 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />

          <div className="flex gap-4">
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition">
              <Send size={18} /> Send Message
            </button>

            <button
              type="button"
              onClick={clearForm}
              className="flex items-center gap-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-black dark:text-white px-6 py-3 rounded-lg transition"
            >
              <XCircle size={18} /> Clear
            </button>
          </div>
        </form>

        {status && (
          <p className={`mt-4 text-sm font-semibold ${
            status.includes("⚠") || status.includes("❌") 
              ? "text-red-500 dark:text-red-400" 
              : "text-green-500 dark:text-green-400"
          }`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

export default Contacts;
