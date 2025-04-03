import React, { useEffect, useState } from "react";

export default function ScaledLayout({ baseWidth, baseHeight, children }) {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Calculate how much we should scale the entire 1200×700 layout
  const scale = Math.min(
    windowSize.width / baseWidth,
    windowSize.height / baseHeight
  );

  return (
    <div
      style={{
        width: baseWidth,
        height: baseHeight,
        // Pin to the top-left so it doesn't slide down
        position: "absolute",
        top: 0,
        left: 0,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        background: "#000", // or remove if you prefer
        overflow: "hidden"
      }}
    >
      {children}
    </div>
  );
}
