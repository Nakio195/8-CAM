// Internal styleguide page (specification 6.13): every token, font, component, sticker and pattern, for validation.
import { mount } from "svelte";
import "./ui/theme/fonts";
import "./ui/theme/tokens.css";
import Styleguide from "./ui/styleguide/Styleguide.svelte";

const target = document.getElementById("app");
if (!target)
{
    throw new Error("Missing #app element in styleguide.html");
}

mount(Styleguide, { target });
