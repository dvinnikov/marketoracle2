import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root") as HTMLElement;
createRoot(rootEl).render((<App />) as React.ReactNode);
