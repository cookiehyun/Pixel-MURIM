// HTML sign-up / log-in form shown over the canvas (real text fields, so phone keyboards work).
import * as Account from "./account";
import * as K from "./input";

let busy = false;

/** mode "create" or "login". Resolves true when the player is logged in afterwards. */
export function open(mode: "create" | "login"): Promise<boolean> {
  const box = document.getElementById("acct") as HTMLDivElement;
  const id = document.getElementById("acct-id") as HTMLInputElement;
  const pw = document.getElementById("acct-pw") as HTMLInputElement;
  const pw2 = document.getElementById("acct-pw2") as HTMLInputElement;
  const msg = document.getElementById("acct-msg") as HTMLDivElement;
  const ok = document.getElementById("acct-ok") as HTMLButtonElement;
  const cancel = document.getElementById("acct-cancel") as HTMLButtonElement;
  (document.getElementById("acct-title") as HTMLDivElement).textContent = mode === "create" ? "CREATE ACCOUNT" : "LOG IN";
  pw2.parentElement!.style.display = mode === "create" ? "" : "none";
  ok.textContent = mode === "create" ? "CREATE" : "LOG IN";
  id.value = ""; pw.value = ""; pw2.value = ""; msg.textContent = mode === "create" ? "ID: A-Z 0-9, UP TO 10 / PASSWORD: 6+" : "";
  box.hidden = false;
  K.setSuspended(true);
  setTimeout(() => id.focus(), 0);
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      box.hidden = true;
      K.setSuspended(false);
      ok.onclick = null; cancel.onclick = null; box.onkeydown = null;
      resolve(v);
    };
    id.oninput = () => { const c = Account.cleanId(id.value); if (c !== id.value) id.value = c; };
    ok.onclick = async () => {
      if (busy) return;
      if (mode === "create" && pw.value !== pw2.value) { msg.textContent = "PASSWORDS DO NOT MATCH"; return; }
      busy = true; ok.disabled = true; msg.textContent = "...";
      try {
        if (mode === "create") await Account.signUp(id.value, pw.value);
        else await Account.logIn(id.value, pw.value);
        done(true);
      } catch (e) {
        msg.textContent = String((e as Error).message || e).toUpperCase();
      } finally { busy = false; ok.disabled = false; }
    };
    cancel.onclick = () => done(false);
    box.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") ok.click();
      if (e.key === "Escape") done(false);
    };
  });
}

export const isOpen = () => !(document.getElementById("acct") as HTMLDivElement).hidden;
