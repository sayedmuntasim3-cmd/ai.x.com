// Browser entry: attaches React to the server-rendered page so the studio becomes interactive.
import { hydrateRoot } from "react-dom/client";
import Landing from "./landing";

const root = document.getElementById("root");
if (root) hydrateRoot(root, <Landing />);
