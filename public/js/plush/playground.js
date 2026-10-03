/** Material direction for the next AI render. This module never alters the preview. */
export function initPlush({ getState, onUseOriginal }) {
  const generateButton = document.querySelector(".make-panel #generate");
  if (!generateButton)
    throw new Error("The material controls need the builder.");

  const selection = { material: "fur", texture: "teddy", lighting: "soft" };
  const textures = {
    velvet:
      "Dense, very short velvet pile with a clean silhouette and a soft tactile finish.",
    teddy:
      "Soft, medium-short teddy plush with clearly resolved fibers and gently rounded volume.",
    shag: "Long, airy shag fibers with natural clumping. Keep the face unobstructed and the silhouette recognizable.",
  };
  const root = document.createElement("section");
  root.className = "plush-playground";
  root.setAttribute("aria-label", "Material for your next render");
  root.innerHTML = `
    <div class="plush-original-row">
      <div><strong>Love it as it is?</strong><span>Make layouts from your original. No AI needed.</span></div>
      <button type="button" class="plush-original">Use original <span aria-hidden="true">→</span></button>
    </div>
    <fieldset class="plush-fieldset">
      <legend>Give it a feel</legend>
      <div class="plush-segments" role="group" aria-label="Material">
        <button type="button" data-plush-material="fur" aria-pressed="true">Plush</button>
        <button type="button" data-plush-material="clay" aria-pressed="false">3D clay</button>
      </div>
    </fieldset>
    <fieldset class="plush-fieldset" data-plush-textures>
      <legend>Texture</legend>
      <div class="plush-textures" role="group" aria-label="Plush texture">
        <button type="button" data-plush-texture="velvet" aria-pressed="false"><strong>Velvet</strong><span>Short & smooth</span></button>
        <button type="button" data-plush-texture="teddy" aria-pressed="true"><strong>Teddy</strong><span>Soft & fuzzy</span></button>
        <button type="button" data-plush-texture="shag" aria-pressed="false"><strong>Shag</strong><span>Long & fluffy</span></button>
      </div>
    </fieldset>
    <fieldset class="plush-fieldset">
      <legend>Lighting</legend>
      <div class="plush-segments" role="group" aria-label="Lighting">
        <button type="button" data-plush-lighting="soft" aria-pressed="true">Soft studio</button>
        <button type="button" data-plush-lighting="crisp" aria-pressed="false">Crisp daylight</button>
      </div>
    </fieldset>
    <details class="plush-direction"><summary>Add a little direction <span>Optional</span></summary>
      <label for="plush-direction-input">What do you have in mind?</label>
      <textarea id="plush-direction-input" rows="3" maxlength="360" placeholder="A cream face, warm yellow fur, and a curious expression…"></textarea>
      <p>Describe the details you want to keep or change.</p>
    </details>
    <p class="plush-render-note">These choices guide your next AI render. They don’t change the current preview.</p>
    <p class="plush-error" role="status" hidden></p>`;
  generateButton.before(root);

  const originalButton = root.querySelector(".plush-original");
  const direction = root.querySelector("textarea");
  const error = root.querySelector(".plush-error");
  let usingOriginal = false;

  function paintChoices() {
    for (const key of ["material", "texture", "lighting"]) {
      root.querySelectorAll(`[data-plush-${key}]`).forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.getAttribute(`data-plush-${key}`) === selection[key]),
        );
      });
    }
    root.querySelector("[data-plush-textures]").hidden =
      selection.material !== "fur";
  }

  function refresh() {
    const state = getState();
    const busy = Boolean(state.busy || usingOriginal);
    root.querySelectorAll("button, textarea").forEach((control) => {
      control.disabled = busy;
    });
    originalButton.disabled = busy || !state.source;
    root.setAttribute("aria-busy", String(busy));
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled || getState().busy) return;
    for (const key of ["material", "texture", "lighting"]) {
      const value = button.getAttribute(`data-plush-${key}`);
      if (value) {
        selection[key] = value;
        paintChoices();
        root.dispatchEvent(
          new CustomEvent("plush:change", {
            bubbles: true,
            detail: { ...selection },
          }),
        );
      }
    }
  });

  originalButton.addEventListener("click", async () => {
    if (getState().busy || usingOriginal || !getState().source) return;
    usingOriginal = true;
    error.hidden = true;
    refresh();
    try {
      await onUseOriginal();
    } catch (cause) {
      error.textContent =
        cause instanceof Error
          ? cause.message
          : "Could not open your original. Please try again.";
      error.hidden = false;
    } finally {
      usingOriginal = false;
      refresh();
    }
  });

  function getPrompt(selectedMaterial = selection.material) {
    const identity =
      getState().mode === "mascot"
        ? "Create a mascot inspired by the uploaded source, retaining its most recognizable visual cues."
        : "Preserve the uploaded icon’s identity: its recognizable silhouette, proportions, colors, and facial features. Do not replace it with a generic character.";
    const material =
      selectedMaterial === "fur"
        ? textures[selection.texture]
        : "Smooth matte sculpted clay, with rounded three-dimensional volume and subtle tactile surface detail. No fur, no glossy plastic.";
    const lighting =
      selection.lighting === "soft"
        ? "Soft, diffused studio lighting with gentle contact shadows and readable facial features."
        : "Crisp directional daylight with clear form and texture, controlled highlights, and no harsh shadow obscuring the face.";
    return [
      identity,
      material,
      lighting,
      direction.value.trim()
        ? `Additional direction: ${direction.value.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function reset() {
    Object.assign(selection, {
      material: "fur",
      texture: "teddy",
      lighting: "soft",
    });
    direction.value = "";
    root.querySelector("details").open = false;
    error.hidden = true;
    paintChoices();
    refresh();
  }

  paintChoices();
  refresh();
  return {
    getPrompt,
    getMaterial: () => selection.material,
    setMaterial(material) {
      if (!["fur", "clay"].includes(material)) return;
      selection.material = material;
      paintChoices();
      root.dispatchEvent(
        new CustomEvent("plush:change", {
          bubbles: true,
          detail: { ...selection },
        }),
      );
    },
    reset,
    refresh,
  };
}
