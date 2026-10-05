import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    title: 'Every section, one system',
    text: 'Bar, Restaurant, Bakery — each section counts and orders independently, while owners see the whole venue in one place.',
  },
  {
    title: 'Built for purchasing',
    text: 'Sent lists become a strike-off notepad for purchase staff. Confirm with a bill reference; sections verify the delivery.',
  },
  {
    title: 'Stock that updates itself',
    text: 'Received orders add to Current Inventory automatically — know what’s on the shelf before you count it.',
  },
  {
    title: 'Order the smart way',
    text: 'Stock Mode derives your order from what’s on the shelf vs. your Max — with manual entry for the exceptions.',
  },
];

const STEPS = [
  { n: '1', title: 'Order', text: 'Each section declares what’s on the shelf and sends its list to purchasing.' },
  { n: '2', title: 'Purchase', text: 'Purchase staff buy the lists together and confirm with the bill.' },
  { n: '3', title: 'Receive', text: 'Sections cross-verify the delivery — Current Inventory updates automatically.' },
];

export default function LandingPage() {
  // Placeholder product name — "SEL" was the first venue, not the brand.
  useEffect(() => { document.title = 'Inventory Management System'; }, []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">Inventory Management <span>System</span></Link>
        <nav className="landing-nav-actions">
          <Link className="landing-login" to="/login">Log in</Link>
          <Link className="landing-register" to="/register">Register</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <h1>Inventory Management System</h1>
        <p>
          One system for every section of your venue — count what&rsquo;s on the shelf,
          send the order, purchase with a bill, and receive with a check.
        </p>
        <div className="landing-cta">
          <Link to="/register" className="btn btn-primary">Get Started</Link>
          <Link to="/to-order" className="btn btn-secondary">Open the App</Link>
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div className="landing-feature" key={f.title}>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>

      <section className="landing-steps">
        <h2>How it works</h2>
        <div className="landing-steps-grid">
          {STEPS.map((s) => (
            <div className="landing-step" key={s.n}>
              <span className="landing-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>SEL Inventory — built for venues that never run out.</span>
        <span className="landing-footer-links">
          <Link to="/to-order">Open the App</Link>
        </span>
      </footer>
    </div>
  );
}
