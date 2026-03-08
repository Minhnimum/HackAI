import { createBrowserRouter } from "react-router";
import { Home } from "./pages/home";
import { Preview } from "./pages/preview";
import { Transcribe } from "./pages/transcribe";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/preview",
    Component: Preview,
  },
  {
    path: "/transcribe",
    Component: Transcribe,
  },
]);
