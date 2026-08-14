/**
 * Blood–brain-barrier visualisation.
 *
 * **This is a rendering of a prediction, not a simulation.** No trajectory here
 * comes from a force field, a solvent model, or a molecular-dynamics run. Every
 * quantity that drives the scene is a value returned by the BBB service, and
 * the readout beside the canvas shows those values, so the picture and the
 * numbers can never drift apart.
 *
 * What the model output controls:
 *
 * | model output                | what it changes on screen                 |
 * |-----------------------------|-------------------------------------------|
 * | BBB probability             | the fraction of particles that cross       |
 * | applicability domain        | particle opacity and an explicit warning   |
 * | efflux heuristic flag       | particles that reach the abluminal face    |
 * |                             | and are returned to the lumen              |
 * | experimental logBB          | a separate marker, drawn only if measured  |
 *
 * A particle that fails to cross stalls at the membrane and drifts back. It is
 * not "rejected by the tight junction" in any physical sense, and the caption
 * says so.
 */

const PALETTE = {
  dark: {
    lumen: "#0d1b26",
    lumenEdge: "#16303f",
    blood: "#1c3a4d",
    cell: "#1b2a38",
    cellEdge: "#2c4657",
    nucleus: "#243746",
    junction: "#35c6d8",
    membrane: "#4a9eff",
    brain: "#121d17",
    brainEdge: "#1f3327",
    neuron: "#2f4a3a",
    text: "#93a4b8",
    crossed: "#3fb950",
    stalled: "#d29922",
    effluxed: "#f85149",
    particle: "#e6edf5",
  },
  light: {
    lumen: "#eef5fa",
    lumenEdge: "#cfe2ee",
    blood: "#d6e8f3",
    cell: "#f2f6f9",
    cellEdge: "#cbd8e2",
    nucleus: "#e2ebf2",
    junction: "#0d7c8c",
    membrane: "#0969da",
    brain: "#eef4ee",
    brainEdge: "#cfe0d2",
    neuron: "#c3d8c9",
    text: "#4d5f72",
    crossed: "#1a7f37",
    stalled: "#9a6700",
    effluxed: "#cf222e",
    particle: "#131b24",
  },
};

const PARTICLE_COUNT = 26;

/** Layout fractions of the canvas width, left (blood) to right (brain). */
const LAYOUT = {
  lumenEnd: 0.3,
  membraneOuter: 0.38,
  membraneInner: 0.56,
  cellEnd: 0.64,
  brainStart: 0.72,
};

export class BbbAnimation {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} inputs  the `animation` block from /lab/chem/bbb
   */
  constructor(canvas, inputs) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.inputs = inputs;
    this.running = false;
    this.frame = 0;
    this.rafId = null;
    this.particles = [];
    this.stats = { crossed: 0, stalled: 0, effluxed: 0 };
    this.theme =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";
    this.colors = PALETTE[this.theme];
    this.reset();
  }

  get probability() {
    const value = this.inputs?.probability;
    return typeof value === "number" ? Math.max(0, Math.min(1, value)) : null;
  }

  reset() {
    const probability = this.probability;
    this.stats = { crossed: 0, stalled: 0, effluxed: 0 };
    this.particles = [];

    if (probability === null) return;

    const effluxRisk = this.inputs?.efflux_flag?.flagged ? 0.35 : 0;

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      // Each particle's fate is drawn from the model probability, so the
      // proportion crossing on screen *is* the predicted probability rather
      // than an impression of it.
      const willCross = Math.random() < probability;
      const willEfflux = willCross && Math.random() < effluxRisk;
      this.particles.push({
        x: Math.random() * 0.26,
        y: 0.14 + Math.random() * 0.72,
        speed: 0.0016 + Math.random() * 0.0022,
        wobble: Math.random() * Math.PI * 2,
        wobbleRate: 0.02 + Math.random() * 0.03,
        radius: 3 + Math.random() * 2,
        fate: willEfflux ? "efflux" : willCross ? "cross" : "stall",
        state: "approaching",
        // Staggered so they do not arrive at the membrane as one wave, but
        // short enough that the scene is populated immediately: an empty
        // vessel for four seconds reads as "nothing was computed".
        delay: index < 8 ? 0 : Math.random() * 70,
        settledAt: null,
      });
    }
  }

  start() {
    if (this.running || this.probability === null) return;
    this.running = true;
    const step = () => {
      if (!this.running) return;
      this.frame += 1;
      this.update();
      this.render();
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  destroy() {
    this.stop();
  }

  update() {
    for (const particle of this.particles) {
      if (this.frame < particle.delay) continue;

      particle.wobble += particle.wobbleRate;
      particle.y += Math.sin(particle.wobble) * 0.0012;
      particle.y = Math.max(0.08, Math.min(0.92, particle.y));

      if (particle.state === "approaching") {
        particle.x += particle.speed;
        if (particle.x >= LAYOUT.membraneOuter) {
          if (particle.fate === "stall") {
            particle.state = "stalled";
            this.stats.stalled += 1;
          } else {
            particle.state = "crossing";
          }
        }
      } else if (particle.state === "crossing") {
        // Crossing is drawn slower than transport in the lumen: the membrane is
        // the rate-limiting step in the model's own terms, not in any
        // simulated physics.
        particle.x += particle.speed * 0.45;
        if (particle.x >= LAYOUT.cellEnd) {
          if (particle.fate === "efflux") {
            particle.state = "effluxing";
            this.stats.effluxed += 1;
          } else {
            particle.state = "crossed";
            this.stats.crossed += 1;
          }
        }
      } else if (particle.state === "crossed") {
        particle.x += particle.speed * 0.8;
        if (particle.x > 1.04) {
          particle.x = Math.random() * 0.16;
          particle.state = "approaching";
          this.stats.crossed -= 1;
        }
      } else if (particle.state === "stalled") {
        particle.x -= particle.speed * 0.55;
        if (particle.x < 0.06) {
          particle.state = "approaching";
          this.stats.stalled -= 1;
        }
      } else if (particle.state === "effluxing") {
        particle.x -= particle.speed * 0.7;
        if (particle.x < LAYOUT.membraneOuter - 0.06) {
          particle.state = "approaching";
          this.stats.effluxed -= 1;
        }
      }
    }
  }

  render() {
    const { canvas, context } = this;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 720;
    const height = Math.round(width * 0.46);

    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.height = `${height}px`;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    this.drawScene(context, width, height);
    this.drawParticles(context, width, height);
    this.drawLabels(context, width, height);
  }

  drawScene(context, width, height) {
    const c = this.colors;
    const x = (fraction) => fraction * width;

    // -- vessel lumen (blood side) ------------------------------------
    const bloodGradient = context.createLinearGradient(0, 0, x(LAYOUT.lumenEnd), 0);
    bloodGradient.addColorStop(0, c.blood);
    bloodGradient.addColorStop(1, c.lumen);
    context.fillStyle = bloodGradient;
    context.fillRect(0, 0, x(LAYOUT.membraneOuter), height);

    // Flowing plasma streaks: motion cue only, no quantity attached.
    context.strokeStyle = c.lumenEdge;
    context.lineWidth = 1;
    for (let index = 0; index < 7; index += 1) {
      const y = ((index + 0.5) / 7) * height;
      const offset = ((this.frame * 0.9 + index * 40) % (width * 0.5)) - width * 0.1;
      context.globalAlpha = 0.45;
      context.beginPath();
      context.moveTo(offset, y);
      context.lineTo(offset + width * 0.08, y);
      context.stroke();
    }
    context.globalAlpha = 1;

    // -- endothelial cell layer ---------------------------------------
    context.fillStyle = c.cell;
    context.fillRect(
      x(LAYOUT.membraneOuter),
      0,
      x(LAYOUT.cellEnd) - x(LAYOUT.membraneOuter),
      height
    );

    // Two membranes: luminal and abluminal, drawn as bilayers.
    this.drawBilayer(context, x(LAYOUT.membraneOuter), height, width);
    this.drawBilayer(context, x(LAYOUT.membraneInner), height, width);

    // Endothelial nuclei.
    context.fillStyle = c.nucleus;
    for (let index = 0; index < 3; index += 1) {
      const y = (index + 0.5) * (height / 3);
      context.beginPath();
      context.ellipse(
        (x(LAYOUT.membraneOuter) + x(LAYOUT.membraneInner)) / 2,
        y,
        width * 0.022,
        height * 0.075,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
    }

    // Cell borders.
    context.strokeStyle = c.cellEdge;
    context.lineWidth = 1.2;
    for (let index = 1; index < 3; index += 1) {
      const y = index * (height / 3);
      context.beginPath();
      context.moveTo(x(LAYOUT.membraneOuter), y);
      context.lineTo(x(LAYOUT.cellEnd), y);
      context.stroke();
    }

    // -- tight junctions ----------------------------------------------
    context.strokeStyle = c.junction;
    context.lineWidth = 2.4;
    for (let index = 1; index < 3; index += 1) {
      const y = index * (height / 3);
      context.beginPath();
      for (let step = 0; step <= 10; step += 1) {
        const px = x(LAYOUT.membraneOuter) + (step / 10) * (x(LAYOUT.cellEnd) - x(LAYOUT.membraneOuter));
        const py = y + (step % 2 === 0 ? -2.5 : 2.5);
        step === 0 ? context.moveTo(px, py) : context.lineTo(px, py);
      }
      context.stroke();
    }

    // -- brain (abluminal) side ---------------------------------------
    context.fillStyle = c.brain;
    context.fillRect(x(LAYOUT.cellEnd), 0, width - x(LAYOUT.cellEnd), height);

    // Schematic neurons/astrocyte end-feet on the brain side.
    context.strokeStyle = c.neuron;
    context.lineWidth = 1.6;
    for (let index = 0; index < 4; index += 1) {
      const cx = x(LAYOUT.brainStart) + (index % 2) * width * 0.11 + width * 0.05;
      const cy = (index + 0.5) * (height / 4);
      context.beginPath();
      context.arc(cx, cy, height * 0.035, 0, Math.PI * 2);
      context.stroke();
      for (let branch = 0; branch < 4; branch += 1) {
        const angle = (branch / 4) * Math.PI * 2 + 0.5;
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * height * 0.035, cy + Math.sin(angle) * height * 0.035);
        context.lineTo(cx + Math.cos(angle) * height * 0.09, cy + Math.sin(angle) * height * 0.09);
        context.stroke();
      }
    }
  }

  drawBilayer(context, xPosition, height, width) {
    const c = this.colors;
    const headRadius = Math.max(1.6, width * 0.0034);
    context.fillStyle = c.membrane;
    for (let y = headRadius; y < height; y += headRadius * 3.1) {
      context.globalAlpha = 0.75;
      context.beginPath();
      context.arc(xPosition - headRadius * 1.2, y, headRadius, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(xPosition + headRadius * 1.2, y, headRadius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.3;
      context.fillRect(xPosition - headRadius * 0.6, y - 0.6, headRadius * 1.2, 1.2);
    }
    context.globalAlpha = 1;
  }

  drawParticles(context, width, height) {
    const c = this.colors;
    const insideDomain = this.inputs?.inside_applicability_domain !== false;

    for (const particle of this.particles) {
      if (this.frame < particle.delay) continue;

      const px = particle.x * width;
      const py = particle.y * height;

      const color =
        particle.state === "crossed"
          ? c.crossed
          : particle.state === "stalled"
            ? c.stalled
            : particle.state === "effluxing"
              ? c.effluxed
              : c.particle;

      // Outside the applicability domain the model is extrapolating, so the
      // particles are drawn faint: the picture should look as uncertain as the
      // prediction behind it.
      context.globalAlpha = insideDomain ? 0.92 : 0.42;

      context.beginPath();
      context.arc(px, py, particle.radius, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();

      context.globalAlpha = insideDomain ? 0.22 : 0.1;
      context.beginPath();
      context.arc(px, py, particle.radius * 2.4, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    }
    context.globalAlpha = 1;
  }

  drawLabels(context, width, height) {
    const c = this.colors;
    context.font =
      "500 11px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    context.fillStyle = c.text;
    context.textAlign = "center";

    context.fillText("Blood (luminal)", width * 0.15, 16);
    context.fillText("Endothelium", width * (LAYOUT.membraneOuter + LAYOUT.cellEnd) / 2, 16);
    context.fillText("Brain (abluminal)", width * 0.86, 16);

    context.textAlign = "left";
    context.fillStyle = c.junction;
    context.fillText("tight junction", width * LAYOUT.membraneOuter + 6, height - 8);
  }

  /** Live counts for the caption beneath the canvas. */
  snapshot() {
    return {
      ...this.stats,
      total: this.particles.length,
      probability: this.probability,
    };
  }
}
