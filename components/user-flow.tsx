"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { GeoJsonMap } from "@/components/geojson-map";
import { fetchOrderPreview } from "@/lib/api";
import {
  buildMockOrder,
  buildMockPreview,
  defaultMockOrder,
  defaultOrderForm,
} from "@/lib/mock-order";
import {
  loadOrderForm,
  loadOrderPreview,
  loadTrackingOrder,
  saveOrderForm,
  saveOrderPreview,
  saveTrackingOrder,
} from "@/lib/storage";
import {
  DroneOption,
  OrderFormData,
  PreviewResult,
  TrackingStep,
} from "@/lib/types";

const medicineOptions = [
  { value: "pain-relief", label: "Pain relief" },
  { value: "antibiotics", label: "Antibiotics" },
  { value: "insulin", label: "Insulin" },
  { value: "cardiac", label: "Cardiac medicine" },
  { value: "custom", label: "Other / custom" },
] as const;

const priorityOptions = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
  { value: "critical", label: "Critical" },
] as const;

const subscribeToStorage = () => () => {};

function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToStorage,
    () => true,
    () => false
  );
}

function SiteHeader({ currentPath }: { currentPath: string }) {
  const navItems = [
    { href: "/", label: "Order" },
    { href: "/preview", label: "Preview" },
    { href: "/confirm", label: "Confirm" },
    { href: `/track/${defaultMockOrder.id}`, label: "Tracking" },
  ];

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div className="brand">VTOL Medicine Delivery</div>
        <nav className="nav-row">
          {navItems.map((item) => (
            <Link
              className={`nav-pill ${currentPath === item.href ? "is-active" : ""}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function RouteMapPreview({ preview }: { preview: PreviewResult }) {
  return <GeoJsonMap preview={preview} />;
}

function DroneCard({ drone, selected }: { drone: DroneOption; selected: boolean }) {
  return (
    <div className={`drone-card ${selected ? "selected" : ""}`}>
      <div className="drone-card-header">
        <strong>{drone.id}</strong>
        <span className={`tag ${drone.availability === "ready" ? "success" : "warning"}`}>
          {drone.availability}
        </span>
      </div>
      <p className="panel-subtle">{drone.model}</p>
      <div className="mini-stats">
        <span>ETA {drone.etaMinutes} min</span>
        <span>Battery {drone.batteryLevel}%</span>
        <span>Payload {drone.payloadKg} kg</span>
      </div>
    </div>
  );
}

function TrackingTimeline({ steps }: { steps: TrackingStep[] }) {
  return (
    <div className="timeline-card">
      <h3>Order timeline</h3>
      <ul>
        {steps.map((step) => (
          <li className="timeline-item" key={step.status}>
            <div className={`timeline-dot ${step.completed ? "completed" : "upcoming"}`} />
            <div className="timeline-copy">
              <strong>{step.label}</strong>
              <p>{step.note}</p>
              <p className="timestamp-text">{step.timestamp}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrderEntryPage() {
  const isHydrated = useIsHydrated();
  const storedForm = isHydrated ? loadOrderForm() ?? defaultOrderForm : defaultOrderForm;
  const [draftForm, setDraftForm] = useState<OrderFormData>(defaultOrderForm);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = hasDraftChanges ? draftForm : storedForm;

  const updateField = <K extends keyof OrderFormData>(key: K, value: OrderFormData[K]) => {
    setHasDraftChanges(true);
    setDraftForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handlePreview = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const preview = await fetchOrderPreview(form);
      saveOrderForm(form);
      saveOrderPreview(preview);
      window.location.href = "/preview";
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to load preview");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <SiteHeader currentPath="/" />
      <main className="container hero">
        <div className="hero-grid">
          <section className="hero-copy">
            <div className="badge-row" style={{ marginBottom: 16 }}>
              <span className="badge">User page MVP</span>
              <span className="badge">Step 1 of 4</span>
            </div>
            <h1>Order medicine delivery with your drone frontend skeleton.</h1>
            <p>
              This homepage is also the order page. Users can input pickup and dropoff
              details, medicine type, payload, contact info, and urgency before moving to
              preview.
            </p>
            <div className="hero-list">
              <div className="info-card">
                <span>Input collected</span>
                <strong>Locations, medicine, weight, contact, urgency</strong>
              </div>
              <div className="info-card">
                <span>Next action</span>
                <strong>Generate preview and pricing with backend later</strong>
              </div>
            </div>
          </section>

          <aside className="hero-card hero-visual">
            <h3>User journey</h3>
            <div className="step-row">
              <span className="step-pill active">1. Order</span>
              <span className="step-pill">2. Preview</span>
              <span className="step-pill">3. Confirm</span>
              <span className="step-pill">4. Track</span>
            </div>
            <p className="panel-subtle">
              First, users fill in the order form. The preview page now calls the backend
              API for available drones, ETA, price, GeoJSON path, and route safety.
            </p>
          </aside>
        </div>

        <section className="section">
          <div className="section-heading">
            <h2>Order form</h2>
            <p>Use this as your main user-facing form before connecting the real backend.</p>
          </div>

          <div className="panel form-panel-wide">
            <div className="form-grid">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="patientName">Patient name</label>
                  <input
                    id="patientName"
                    value={form.patientName}
                    onChange={(event) => updateField("patientName", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="contactNumber">Contact number</label>
                  <input
                    id="contactNumber"
                    value={form.contactNumber}
                    onChange={(event) => updateField("contactNumber", event.target.value)}
                  />
                </div>
              </div>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="pickupAddress">Pickup address</label>
                  <input
                    id="pickupAddress"
                    value={form.pickupAddress}
                    onChange={(event) => updateField("pickupAddress", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dropoffAddress">Dropoff address</label>
                  <input
                    id="dropoffAddress"
                    value={form.dropoffAddress}
                    onChange={(event) => updateField("dropoffAddress", event.target.value)}
                  />
                </div>
              </div>

              <div className="field-grid field-grid-four">
                <div className="field">
                  <label htmlFor="pickupLat">Pickup latitude</label>
                  <input
                    id="pickupLat"
                    value={form.pickupLat}
                    onChange={(event) => updateField("pickupLat", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pickupLng">Pickup longitude</label>
                  <input
                    id="pickupLng"
                    value={form.pickupLng}
                    onChange={(event) => updateField("pickupLng", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dropoffLat">Dropoff latitude</label>
                  <input
                    id="dropoffLat"
                    value={form.dropoffLat}
                    onChange={(event) => updateField("dropoffLat", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="dropoffLng">Dropoff longitude</label>
                  <input
                    id="dropoffLng"
                    value={form.dropoffLng}
                    onChange={(event) => updateField("dropoffLng", event.target.value)}
                  />
                </div>
              </div>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="medicineType">Medicine type</label>
                  <select
                    id="medicineType"
                    value={form.medicineType}
                    onChange={(event) =>
                      updateField("medicineType", event.target.value as OrderFormData["medicineType"])
                    }
                  >
                    {medicineOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="weightKg">Weight (kg)</label>
                  <input
                    id="weightKg"
                    value={form.weightKg}
                    onChange={(event) => updateField("weightKg", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="priority">Urgency</label>
                  <select
                    id="priority"
                    value={form.priority}
                    onChange={(event) =>
                      updateField("priority", event.target.value as OrderFormData["priority"])
                    }
                  >
                    {priorityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="notes">Handling notes</label>
                <textarea
                  id="notes"
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                />
              </div>

              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={isSubmitting}
                  onClick={() => void handlePreview()}
                  type="button"
                >
                  {isSubmitting ? "Loading preview..." : "Continue to preview"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setHasDraftChanges(true);
                    setDraftForm(defaultOrderForm);
                    saveOrderForm(defaultOrderForm);
                  }}
                  type="button"
                >
                  Reset sample data
                </button>
              </div>

              {submitError ? <p className="error-text">{submitError}</p> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function PreviewPage() {
  const isHydrated = useIsHydrated();
  const form = isHydrated ? loadOrderForm() ?? defaultOrderForm : defaultOrderForm;
  const preview = isHydrated
    ? loadOrderPreview() ?? buildMockPreview(form)
    : buildMockPreview(defaultOrderForm);

  const selectedDrone = preview.availableDrones.find((drone) => drone.id === preview.droneId);

  return (
    <div className="page-shell">
      <SiteHeader currentPath="/preview" />
      <main className="container section">
        <div className="section-heading">
          <h2>Route preview and quotation</h2>
          <p>
            Live backend preview response, including available drones, estimated time,
            pricing, GeoJSON route data, and no-fly validation.
          </p>
        </div>

        <div className="preview-layout">
          <div className="summary-grid">
            <div className="stat-card">
              <span>ETA</span>
              <strong>{preview.etaMinutes} min</strong>
            </div>
            <div className="stat-card">
              <span>Estimated fee</span>
              <strong>HK${preview.priceHkd}</strong>
            </div>
            <div className="stat-card">
              <span>Available drone</span>
              <strong>{preview.droneId}</strong>
            </div>
            <div className="stat-card">
              <span>Safety check</span>
              <strong>{preview.noFlyCheckPassed ? "Pass" : "Fail"}</strong>
            </div>
          </div>

          <div className="preview-two-column">
            <div className="preview-layout">
              <RouteMapPreview preview={preview} />
              <div className="panel">
                <h3>Order summary</h3>
                <div className="info-grid">
                  <div className="info-card">
                    <span>Pickup</span>
                    <strong>{form.pickupAddress}</strong>
                  </div>
                  <div className="info-card">
                    <span>Dropoff</span>
                    <strong>{form.dropoffAddress}</strong>
                  </div>
                  <div className="info-card">
                    <span>Medicine</span>
                    <strong>{form.medicineType}</strong>
                  </div>
                  <div className="info-card">
                    <span>Priority</span>
                    <strong>{form.priority}</strong>
                  </div>
                </div>
                <p className="helper-text" style={{ marginTop: 16 }}>
                  GeoJSON feature count: {preview.routeGeoJson.features.length}. Later this
                  can come directly from your Python-backed planner.
                </p>
              </div>
            </div>

            <div className="preview-layout">
              <div className="panel">
                <h3>Available drones</h3>
                <p className="panel-subtle">{preview.statusMessage}</p>
                <div className="drone-grid">
                  {preview.availableDrones.map((drone) => (
                    <DroneCard
                      drone={drone}
                      key={drone.id}
                      selected={drone.id === selectedDrone?.id}
                    />
                  ))}
                </div>
              </div>

              <div className="panel">
                <h3>Validation summary</h3>
                <div className="chip-row" style={{ marginBottom: 14 }}>
                  <span className={`tag ${preview.canDeliver ? "success" : "danger"}`}>
                    {preview.canDeliver ? "Can deliver" : "Blocked"}
                  </span>
                  <span className="chip">{preview.distanceKm} km</span>
                  <span className="chip">{preview.droneModel}</span>
                </div>
                <div className="form-grid">
                  {preview.checklist.map((item) => (
                    <div className="info-card" key={item}>
                      <span>Check passed</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="action-row">
                <Link className="secondary-button link-button" href="/">
                  Back to edit order
                </Link>
                <Link className="primary-button link-button" href="/confirm">
                  Continue to confirmation
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function ConfirmPage() {
  const isHydrated = useIsHydrated();
  const order = isHydrated
    ? (() => {
        const form = loadOrderForm() ?? defaultOrderForm;
        const preview = loadOrderPreview() ?? buildMockPreview(form);
        return {
          ...buildMockOrder(form),
          preview,
        };
      })()
    : defaultMockOrder;

  const handleCreateOrder = () => {
    saveTrackingOrder(order);
    window.location.href = `/track/${order.id}`;
  };

  return (
    <div className="page-shell">
      <SiteHeader currentPath="/confirm" />
      <main className="container section">
        <div className="section-heading">
          <h2>Confirm order</h2>
          <p>
            This is the final review page before creating an order. Right now it uses local
            mock data; later this button should call your real create-order API.
          </p>
        </div>

        <div className="confirm-layout">
          <div className="panel">
            <h3>User submission</h3>
            <div className="info-grid">
              <div className="info-card">
                <span>Patient</span>
                <strong>{order.form.patientName}</strong>
              </div>
              <div className="info-card">
                <span>Contact</span>
                <strong>{order.form.contactNumber}</strong>
              </div>
              <div className="info-card">
                <span>Pickup</span>
                <strong>{order.form.pickupAddress}</strong>
              </div>
              <div className="info-card">
                <span>Dropoff</span>
                <strong>{order.form.dropoffAddress}</strong>
              </div>
              <div className="info-card">
                <span>Medicine type</span>
                <strong>{order.form.medicineType}</strong>
              </div>
              <div className="info-card">
                <span>Weight</span>
                <strong>{order.form.weightKg} kg</strong>
              </div>
            </div>
            <div className="panel-divider" />
            <h3>Route and quote</h3>
            <div className="summary-grid">
              <div className="stat-card">
                <span>Order ID</span>
                <strong>{order.id}</strong>
              </div>
              <div className="stat-card">
                <span>Drone</span>
                <strong>{order.preview.droneId}</strong>
              </div>
              <div className="stat-card">
                <span>ETA</span>
                <strong>{order.preview.etaMinutes} min</strong>
              </div>
              <div className="stat-card">
                <span>Fee</span>
                <strong>HK${order.preview.priceHkd}</strong>
              </div>
            </div>
          </div>

          <div className="preview-layout">
            <RouteMapPreview preview={order.preview} />
            <div className="panel">
              <h3>Before you create the order</h3>
              <div className="form-grid">
                <div className="info-card">
                  <span>No-fly validation</span>
                  <strong>{order.preview.noFlyCheckPassed ? "Passed" : "Failed"}</strong>
                </div>
                <div className="info-card">
                  <span>Assigned model</span>
                  <strong>{order.preview.droneModel}</strong>
                </div>
                <div className="info-card">
                  <span>Handling notes</span>
                  <strong>{order.form.notes}</strong>
                </div>
              </div>
              <div className="action-row" style={{ marginTop: 18 }}>
                <Link className="secondary-button link-button" href="/preview">
                  Back to preview
                </Link>
                <button className="primary-button" onClick={handleCreateOrder} type="button">
                  Create mock order
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function TrackingPage({ orderId }: { orderId: string }) {
  const isHydrated = useIsHydrated();
  const order = isHydrated ? loadTrackingOrder(orderId) ?? defaultMockOrder : defaultMockOrder;

  return (
    <div className="page-shell">
      <SiteHeader currentPath={`/track/${defaultMockOrder.id}`} />
      <main className="container section">
        <div className="section-heading">
          <h2>Track order</h2>
          <p>
            Mock tracking page for the user side. It displays a realistic order state flow:
            pending, assigned, flying to pickup, delivering, and completed.
          </p>
        </div>

        <div className="tracking-layout">
          <div className="preview-layout">
            <div className="panel">
              <div className="chip-row" style={{ marginBottom: 16 }}>
                <span className="chip">Order {order.id}</span>
                <span className="chip">Created {order.createdAt}</span>
                <span className="tag success">{order.status}</span>
              </div>
              <h3>Live status summary</h3>
              <div className="summary-grid">
                <div className="stat-card">
                  <span>Current status</span>
                  <strong>{order.status}</strong>
                </div>
                <div className="stat-card">
                  <span>Assigned drone</span>
                  <strong>{order.preview.droneId}</strong>
                </div>
                <div className="stat-card">
                  <span>ETA</span>
                  <strong>{order.preview.etaMinutes} min</strong>
                </div>
                <div className="stat-card">
                  <span>Battery</span>
                  <strong>{order.preview.batteryLevel}%</strong>
                </div>
              </div>
            </div>

            <RouteMapPreview preview={order.preview} />
          </div>

          <div className="preview-layout">
            <TrackingTimeline steps={order.trackingSteps} />
            <div className="panel">
              <h3>Delivery details</h3>
              <div className="info-grid">
                <div className="info-card">
                  <span>Pickup</span>
                  <strong>{order.form.pickupAddress}</strong>
                </div>
                <div className="info-card">
                  <span>Destination</span>
                  <strong>{order.form.dropoffAddress}</strong>
                </div>
                <div className="info-card">
                  <span>Medicine</span>
                  <strong>{order.form.medicineType}</strong>
                </div>
                <div className="info-card">
                  <span>Priority</span>
                  <strong>{order.form.priority}</strong>
                </div>
              </div>
              <div className="action-row" style={{ marginTop: 18 }}>
                <Link className="secondary-button link-button" href="/">
                  Place another order
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
