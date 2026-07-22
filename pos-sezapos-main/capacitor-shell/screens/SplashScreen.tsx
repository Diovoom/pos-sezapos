import { SEZA_LOGO_URL } from "../logo";

export function SplashScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#1e40af",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <div
        style={{
          width: 132,
          height: 132,
          borderRadius: "50%",
          background: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
      >
        <img
          src={SEZA_LOGO_URL}
          alt=""
          style={{ width: 96, height: 96, objectFit: "contain" }}
        />
      </div>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, letterSpacing: 0.5 }}>
        SEZA POS
      </div>
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid rgba(255,255,255,.28)",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "seza-spin .9s linear infinite",
        }}
      />
      <style>{`@keyframes seza-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
