// src/pages/Home.jsx
// ---------------------------------------------------------------
// Citizen Complaint Registration — File a Report
// Renders UploadForm as the single source of truth for submissions.
// ---------------------------------------------------------------

import { useState } from 'react'
import UploadForm from '../components/UploadForm'
import Toast, { useToast } from '../components/Toast'

export default function Home() {
    const { toast, showToast, hideToast } = useToast()
    const [lastDocId, setLastDocId] = useState(null)

    const handleSuccess = ({ docId }) => {
        setLastDocId(docId)
        showToast(
            `Complaint registered! Reference: ${docId.slice(0, 8)}… AI analysis triggered.`,
            'success',
            6000,
        )
    }

    return (
        <div>
            {/* Page intro banner */}
            <div className="max-w-xl mx-auto px-4 sm:px-6 pt-6">
                <div
                    className="mb-2 rounded px-4 py-3 text-xs flex items-start gap-2"
                    style={{
                        background: '#FFF8E7',
                        border: '1px solid #FCEAAA',
                        borderLeft: '4px solid #D97706',
                        color: '#6B4E00',
                    }}
                >
                    <span className="text-base leading-none mt-0.5 flex-shrink-0">ℹ️</span>
                    <span>
                        Fields marked <strong className="text-red-700">*</strong> are mandatory.
                        All complaints are subject to verification by the designated sanitation officer.
                        Misuse of this portal may attract penal action under applicable law.
                    </span>
                </div>
            </div>

            {/* Upload form — single source of truth */}
            <UploadForm onSuccess={handleSuccess} />

            {/* Toast notification */}
            <Toast {...toast} onClose={hideToast} />
        </div>
    )
}
