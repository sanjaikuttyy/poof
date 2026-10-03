import { fail, readJSON, send } from "../http.mjs";
import { validatePNG } from "../image.mjs";
import { buildPrompt } from "../prompt.mjs";

// Each server has its own request lock; tests inject the upstream transport.
export function createGenerationHandler({ fetchImpl, model, timeoutMs }) {
  let active = false;
  return async function generate(req, res) {
    if (req.method !== "POST") fail(405, "Use POST to generate an image.");
    if (active)
      fail(429, "An image is already generating. Wait for it to finish.");
    const body = await readJSON(req);
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail(400, "Send an image and API key.");
    const { key, mode = "fur", material = "fur", prompt = "" } = body;
    if (
      typeof key !== "string" ||
      key.length < 12 ||
      key.length > 512 ||
      /\s|[^\x21-\x7e]/.test(key)
    )
      fail(400, "Enter a valid OpenAI API key.");
    if (
      !["fur", "mascot"].includes(mode) ||
      !["fur", "clay"].includes(material) ||
      typeof prompt !== "string" ||
      prompt.length > 2000
    )
      fail(
        400,
        "Choose a supported transformation and a prompt under 2000 characters.",
      );
    const image = validatePNG(body.image);
    // Check again after reading body: two uploads may arrive concurrently.
    if (active)
      fail(429, "An image is already generating. Wait for it to finish.");
    active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);
    try {
      const form = new FormData();
      for (const [name, value] of Object.entries({
        model,
        prompt: buildPrompt({ mode, material, prompt }),
        n: "1",
        size: "1024x1024",
        quality: "medium",
        background: "transparent",
        output_format: "png",
      }))
        form.set(name, value);
      form.append(
        "image[]",
        new Blob([image], { type: "image/png" }),
        "icon.png",
      );
      const upstream = await fetchImpl(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: controller.signal,
        },
      );
      if (!upstream.ok) {
        const status = upstream.status;
        // Never return upstream bodies: they may echo request contents or secrets.
        if (status === 401)
          fail(
            401,
            "OpenAI did not accept this API key. Check the key and try again.",
          );
        if (status === 403)
          fail(
            403,
            "Your OpenAI account cannot access this image model. Check model access and organization verification.",
          );
        if (status === 429)
          fail(
            429,
            "OpenAI reached a usage or rate limit. Check your API billing and try again later.",
          );
        if (status === 400)
          fail(
            400,
            "OpenAI could not process this image or prompt. Try a different input or check model availability.",
          );
        fail(
          502,
          "OpenAI could not complete this image. Please try again later.",
        );
      }
      const result = await upstream.json();
      const output = `data:image/png;base64,${result?.data?.[0]?.b64_json || ""}`;
      try {
        validatePNG(output, 24 * 1024 * 1024);
      } catch {
        fail(502, "OpenAI returned no usable PNG. Please try again.");
      }
      send(res, 200, { image: output });
    } catch (error) {
      if (controller.signal.aborted)
        fail(
          504,
          "Image generation timed out or was cancelled. No automatic retry was made.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
      res.off("close", onClose);
      active = false;
    }
  };
}
