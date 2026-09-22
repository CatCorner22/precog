import { useEffect, useState } from "react";

const TOUR_KEY = "precog.builderTour.v1";

export function useBuilderTour() {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(TOUR_KEY) === "1");
    } catch {
      setSeen(true);
    }
  }, []);
  const dismiss = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // ignore
    }
    setSeen(true);
  };
  const restart = () => {
    try {
      localStorage.removeItem(TOUR_KEY);
    } catch {
      // ignore
    }
    setSeen(false);
  };
  return { show: !seen, dismiss, restart };
}
