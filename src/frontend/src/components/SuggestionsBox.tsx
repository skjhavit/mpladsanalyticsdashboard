import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

type SuggestionPayload = {
  message: string;
  page?: string;
  feature?: string;
};

export function SuggestionsBox({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [message, setMessage] = useState('');
  const [feature, setFeature] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async (payload: SuggestionPayload) => {
      const res = await fetch(`${apiBaseUrl}/api/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      return res.json();
    },
  });

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3) return;

    await mutation.mutateAsync({
      message: trimmed,
      page: 'home',
      feature: feature.trim() || undefined,
    });

    setMessage('');
    setFeature('');
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h2 className="text-xl font-semibold text-gray-900">What should we add next?</h2>
      <p className="text-sm text-gray-600 mt-1">
        Tell us what feature or additional MPLADS data you’d like to see.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <input
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="Optional: Feature area (e.g., 'Constituency map', 'More vendor analytics')"
          className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Your suggestion..."
          rows={4}
          className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={mutation.isPending || message.trim().length < 3}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {mutation.isPending ? 'Sending…' : 'Send suggestion'}
          </button>

          {mutation.isSuccess ? (
            <span className="text-sm text-green-700">Thanks — saved.</span>
          ) : null}

          {mutation.isError ? (
            <span className="text-sm text-red-600">
              Failed to send. Try again.
            </span>
          ) : null}
        </div>

        <p className="text-xs text-gray-500">
          Note: we store IP/country/user-agent for abuse prevention and analytics.
        </p>
      </div>
    </div>
  );
}
