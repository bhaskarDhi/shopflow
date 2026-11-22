import { useEffect, useState } from 'react';

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setProducts)
      .catch((e) => setError(`Cannot load products: ${e.message}`));
  }, []);

  // Poll the orders that are still pending, to see the worker finish them.
  useEffect(() => {
    if (!orders.some((o) => o.status === 'pending')) return;
    const timer = setInterval(async () => {
      const fresh = await Promise.all(
        orders.map((o) => (o.status === 'pending' ? fetch(`/api/orders/${o.id}`).then((r) => r.json()) : o)),
      );
      setOrders(fresh);
    }, 1000);
    return () => clearInterval(timer);
  }, [orders]);

  async function buy(productId) {
    setError('');
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    if (!res.ok) return setError(`Order failed: HTTP ${res.status}`);
    const order = await res.json();
    setOrders((list) => [order, ...list]);
  }

  const nameOf = (id) => products.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <main>
      <h1>ShopFlow</h1>
      {error && <p className="error">{error}</p>}

      <h2>Products</h2>
      <ul className="products">
        {products.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <span>{money(p.price_cents)}</span>
            <button onClick={() => buy(p.id)}>Buy</button>
          </li>
        ))}
      </ul>

      <h2>My orders</h2>
      {orders.length === 0 && <p className="muted">No orders yet.</p>}
      <ul className="orders">
        {orders.map((o) => (
          <li key={o.id}>
            <span>Order #{o.id}: {nameOf(o.product_id)}</span>
            <span className={`status ${o.status}`}>{o.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
