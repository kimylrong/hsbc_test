"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface DialogHostCtx {
  register: () => () => void;
}

const Ctx = createContext<DialogHostCtx>({
  register: () => () => {},
});

export function useDialogHost() {
  return useContext(Ctx);
}

export function A11yDialogHost() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count > 0) {
      document.body.setAttribute("inert", "");
      document.body.style.overflow = "hidden";
    } else {
      document.body.removeAttribute("inert");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.removeAttribute("inert");
      document.body.style.overflow = "";
    };
  }, [count]);

  const register = () => {
    setCount((c) => c + 1);
    let unmounted = false;
    return () => {
      if (unmounted) return;
      unmounted = true;
      setCount((c) => Math.max(0, c - 1));
    };
  };

  return <Ctx.Provider value={{ register }}>{null as ReactNode}</Ctx.Provider>;
}