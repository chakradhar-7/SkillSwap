import React, { useState } from 'react';
import api from '../../services/api';
import { Star } from 'lucide-react';

const ReviewModal = ({ sessionId, revieweeId, onClose, onReviewSubmitted }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    if (rating === 0) {
      setError('Please provide a rating.');
      setSubmitting(false);
      return;
    }

    try {
      await api.post('/sessions/reviews', {
        sessionId,
        revieweeId,
        rating,
        comment,
      });
      onReviewSubmitted(sessionId);
      onClose();
    } catch (err) {
      console.error('Error submitting review:', err);
      setError(err.response?.data?.msg || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Submit Review</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">Rating:</label>
            <div className="flex">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={30}
                  className={`cursor-pointer ${
                    (hoverRating || rating) >= star ? 'text-yellow-400' : 'text-gray-300'
                  }`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  fill={(hoverRating || rating) >= star ? 'currentColor' : 'none'}
                />
              ))}
            </div>
            {error && rating === 0 && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
          <div className="mb-4">
            <label htmlFor="comment" className="block text-gray-700 text-sm font-bold mb-2">Comment (optional):</label>
            <textarea
              id="comment"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              rows="4"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength="500"
            ></textarea>
          </div>
          {error && rating !== 0 && <p className="text-red-500 text-xs mb-4">{error}</p>}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReviewModal;