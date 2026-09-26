"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Props = {
  open: boolean;
  mobile: string;
  onClose: () => void;
};

export default function ChangePinModal({
  open,
  mobile,
  onClose,
}: Props) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function resetAndClose() {
    if (saving) return;
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setShowPins(false);
    setMessage("");
    setSuccess(false);
    onClose();
  }

  async function changePin() {
    setMessage("");
    setSuccess(false);

    if (!/^\d{6}$/.test(currentPin)) {
      setMessage("Current PIN 6 અંકનો હોવો જોઈએ.");
      return;
    }

    if (!/^\d{6}$/.test(newPin)) {
      setMessage("New PIN 6 અંકનો હોવો જોઈએ.");
      return;
    }

    if (newPin !== confirmPin) {
      setMessage("New PIN અને Confirm PIN match થતા નથી.");
      return;
    }

    if (newPin === currentPin) {
      setMessage("New PIN current PINથી અલગ રાખો.");
      return;
    }

    const weakPins = new Set([
      "000000",
      "111111",
      "123456",
      "654321",
      "121212",
      "222222",
      "333333",
      "444444",
      "555555",
      "666666",
      "777777",
      "888888",
      "999999",
    ]);

    if (weakPins.has(newPin)) {
      setMessage("આ PIN બહુ સરળ છે. બીજો 6-digit PIN પસંદ કરો.");
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const internalEmail = `91${mobile}@yashflow.app`;

    const { error: verifyError } =
      await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: currentPin,
      });

    if (verifyError) {
      setMessage("Current PIN ખોટો છે.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPin,
    });

    if (updateError) {
      setMessage(`PIN Change Error: ${updateError.message}`);
      setSaving(false);
      return;
    }

    setSuccess(true);
    setMessage("PIN સફળતાપૂર્વક બદલાઈ ગયો ✅");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setSaving(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 yf-modal-backdrop">
      <button
        type="button"
        aria-label="Close Change PIN"
        onClick={resetAndClose}
        className="absolute inset-0 bg-slate-950/50"
      />

      <section className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl yf-modal-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
              ACCOUNT SECURITY
            </p>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Change Login PIN
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Current PIN verify થયા પછી નવો 6-digit PIN save થશે.
            </p>
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            disabled={saving}
            className="h-10 w-10 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="yf-label">Current PIN</span>
            <input
              type={showPins ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              value={currentPin}
              onChange={(e) =>
                setCurrentPin(e.target.value.replace(/\D/g, ""))
              }
              className="yf-input"
              placeholder="Current 6-digit PIN"
            />
          </label>

          <label className="block">
            <span className="yf-label">New PIN</span>
            <input
              type={showPins ? "text" : "password"}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={newPin}
              onChange={(e) =>
                setNewPin(e.target.value.replace(/\D/g, ""))
              }
              className="yf-input"
              placeholder="New 6-digit PIN"
            />
          </label>

          <label className="block">
            <span className="yf-label">Confirm New PIN</span>
            <input
              type={showPins ? "text" : "password"}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, ""))
              }
              className="yf-input"
              placeholder="Re-enter new PIN"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowPins((current) => !current)}
            className="text-xs font-black text-blue-700"
          >
            {showPins ? "PIN છુપાવો" : "PIN બતાવો"}
          </button>

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm font-bold ${
                success
                  ? "border-green-200 bg-green-50 text-green-800 yf-success-pop"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={resetAndClose}
              disabled={saving}
              className="yf-btn yf-btn-secondary flex-1"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={changePin}
              disabled={saving}
              className="yf-btn yf-btn-primary flex-1"
            >
              {saving ? "Changing..." : "Change PIN"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
