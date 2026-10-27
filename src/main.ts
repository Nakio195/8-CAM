import { mount } from "svelte";
import "./ui/theme/tokens.css";
import App from "./ui/App.svelte";

const target = document.getElementById("app");
if (!target)
{
    throw new Error("Missing #app element in index.html");
}

mount(App, { target });
