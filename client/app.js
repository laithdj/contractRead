// contract_ai/client/app.js
// A React application that allows users to purchase access via Stripe and
// upload a contract to ask questions.  Authentication has been removed.
// Instead, the user must purchase access before the file upload and Ask
// functionality are enabled.  Payment status is stored in localStorage and
// verified via the `/api/checkout-session` endpoint.

function App() {
  // Payment status and session ID
  const [paid, setPaid] = React.useState(false);
  const [sessionId, setSessionId] = React.useState(null);
  // Form state
  const [file, setFile] = React.useState(null);
  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [loadingAsk, setLoadingAsk] = React.useState(false);
  const [loadingPayment, setLoadingPayment] = React.useState(false);

  // On mount, check if returning from Stripe Checkout or if payment is
  // stored in localStorage.  If a session_id is present in the URL, verify
  // the session and mark the user as paid.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sess = params.get('session_id');
    // Remove query parameters from the URL after processing
    if (sess) {
      // Verify the checkout session
      axios
        .get('/api/checkout-session', { params: { session_id: sess } })
        .then((resp) => {
          if (resp.data && resp.data.paid) {
            setPaid(true);
            setSessionId(sess);
            localStorage.setItem('paid', 'true');
            localStorage.setItem('sessionId', sess);
          }
        })
        .catch((err) => {
          console.error('Failed to verify checkout session', err);
        })
        .finally(() => {
          // Remove query params from the URL without reloading the page
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    } else {
      // Restore payment state from localStorage if available
      const paidFlag = localStorage.getItem('paid');
      const storedSession = localStorage.getItem('sessionId');
      if (paidFlag === 'true' && storedSession) {
        setPaid(true);
        setSessionId(storedSession);
      }
    }
  }, []);

  // Handler for purchasing access.  Calls the server to create a Stripe
  // checkout session and redirects the browser to Stripe.
  const handlePurchase = async () => {
    setLoadingPayment(true);
    try {
      const res = await axios.post('/api/create-checkout-session');
      if (res.data && res.data.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error('Error creating checkout session', err);
    } finally {
      setLoadingPayment(false);
    }
  };

  // Form field handlers
  const handleFileChange = (event) => {
    const selected = event.target.files[0];
    setFile(selected || null);
  };
  const handleQuestionChange = (event) => {
    setQuestion(event.target.value);
  };

  // Submit handler for asking a question
  const handleAsk = async (event) => {
    event.preventDefault();
    setAnswer('');
    if (!file) {
      alert('Please choose a contract file to upload.');
      return;
    }
    if (!question.trim()) {
      alert('Please enter a question about the contract.');
      return;
    }
    if (!paid) {
      alert('You must purchase access before asking questions.');
      return;
    }
    setLoadingAsk(true);
    const formData = new FormData();
    formData.append('contract', file);
    formData.append('question', question.trim());
    // Include the sessionId so the server can verify payment
    if (sessionId) formData.append('sessionId', sessionId);
    try {
      const response = await axios.post('/api/query', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAnswer(response.data.answer || 'No answer returned.');
    } catch (error) {
      console.error(error);
      const errMsg = error.response?.data?.error || 'An error occurred while retrieving the answer.';
      setAnswer(errMsg);
    } finally {
      setLoadingAsk(false);
    }
  };

  return (
    <div className="app-container">
      <h1>Contract Analyzer</h1>
      <p className="subtitle">Upload a contract and ask any question about its contents.</p>
      {!paid && (
        <div className="notice">
          <p>You need to purchase access before uploading a file and asking questions.</p>
          <button className="submit-btn" onClick={handlePurchase} disabled={loadingPayment}>
            {loadingPayment ? 'Redirecting…' : 'Purchase Access'}
          </button>
        </div>
      )}
      <form className="form" onSubmit={handleAsk}>
        <div className="form-group">
          <label htmlFor="file-input">Contract file (PDF or text)</label>
          <input
            id="file-input"
            type="file"
            accept=".pdf,.txt,.text,.md"
            onChange={handleFileChange}
            disabled={!paid}
          />
        </div>
        <div className="form-group">
          <label htmlFor="question-input">Your question</label>
          <textarea
            id="question-input"
            value={question}
            onChange={handleQuestionChange}
            rows={4}
            placeholder="What would you like to know about this contract?"
            disabled={!paid}
          />
        </div>
        <button type="submit" className="submit-btn" disabled={loadingAsk || !paid}>
          {loadingAsk ? 'Analyzing…' : 'Ask'}
        </button>
      </form>
      {answer && (
        <div className="answer-container">
          <h2>Answer</h2>
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}

// Render the React component into the root element
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);