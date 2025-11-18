import React, { useState } from "react"
import {
  buildCSRFHeaders,
  createPetition,
} from "../ash_rpc"

export const CreatePetitionPage = () => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    goal: 100
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const result = await createPetition({
        input: {
          title: formData.title,
          description: formData.description,
          category: formData.category,
          goal: formData.goal,
          status: "open"
        },
        fields: ["id", "title", "description", "status"],
        headers: buildCSRFHeaders(),
      })
      
      if (result.success) {
        console.log("Petition created:", result.data)
        // Reset form or redirect
        setFormData({ title: "", description: "", category: "", goal: 100 })
      } else {
        console.error("Failed to create petition:", result.errors)
      }
    } catch (error) {
      console.error("Error creating petition:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-slate-900 mb-8">Create Petition</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            rows={4}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Category
          </label>
          <input
            type="text"
            value={formData.category}
            onChange={(e) => setFormData({...formData, category: e.target.value})}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Goal (signatures)
          </label>
          <input
            type="number"
            value={formData.goal}
            onChange={(e) => setFormData({...formData, goal: parseInt(e.target.value)})}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            min="1"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          {isSubmitting ? "Creating..." : "Create Petition"}
        </button>
      </form>
    </div>
  )
}