import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Lightbulb } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const CATEGORIES = [
  "Academic",
  "Campus Life",
  "Finance",
  "Wellness",
  "Safety",
  "Accessibility",
  "Other",
]

export default function CreatePetitionPage() {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    goal: "1000",
    targetAudience: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setIsSubmitting(false)
    setShowSuccess(true)

    // Reset form after showing success
    setTimeout(() => {
      setFormData({
        title: "",
        description: "",
        category: "",
        goal: "1000",
        targetAudience: "",
      })
      setShowSuccess(false)
    }, 3000)
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const isFormValid =
    formData.title && formData.description && formData.category && formData.targetAudience

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 text-balance">
              Start a Petition
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
              Make your voice heard and drive positive change in your university community
            </p>
          </div>

          {/* Success Alert */}
          {showSuccess && (
            <Alert className="mb-6 border-primary bg-primary/5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <AlertTitle>Petition Created Successfully!</AlertTitle>
              <AlertDescription>
                Your petition is now live and ready to collect signatures.
              </AlertDescription>
            </Alert>
          )}

          {/* Tips Card */}
          <Card className="mb-8 p-4 rounded-xl border-accent bg-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="w-5 h-5 text-primary" />
                Tips for a Successful Petition
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Be specific and clear about what you want to achieve</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Explain why this issue matters to the community</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Include relevant facts, data, or personal stories</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>Address who has the power to make the change happen</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Petition Form */}
          <Card className="p-4">
            <CardHeader>
              <CardTitle>Petition Details</CardTitle>
              <CardDescription>
                Fill in the information below to create your petition
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-base">
                    Petition Title *
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Extend Library Hours During Finals Week"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    required
                    maxLength={100}
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.title.length}/100 characters
                  </p>
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-base">
                    Category *
                  </Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => handleChange("category", value)}
                    required
                  >
                    <SelectTrigger id="category" className="text-base">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-base">
                    Description *
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="Explain what you want to change and why it matters. Include specific details about the issue and your proposed solution."
                    value={formData.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    required
                    rows={8}
                    maxLength={2000}
                    className="text-base resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.description.length}/2000 characters
                  </p>
                </div>

                {/* Target Audience */}
                <div className="space-y-2">
                  <Label htmlFor="targetAudience" className="text-base">
                    Who can make this change happen? *
                  </Label>
                  <Input
                    id="targetAudience"
                    placeholder="e.g., Dean of Students, University President, Board of Trustees"
                    value={formData.targetAudience}
                    onChange={(e) => handleChange("targetAudience", e.target.value)}
                    required
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    Specify the person or department with the authority to implement this change
                  </p>
                </div>

                {/* Signature Goal */}
                <div className="space-y-2">
                  <Label htmlFor="goal" className="text-base">
                    Signature Goal
                  </Label>
                  <Select
                    value={formData.goal}
                    onValueChange={(value) => handleChange("goal", value)}
                  >
                    <SelectTrigger id="goal" className="text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="500">500 signatures</SelectItem>
                      <SelectItem value="1000">1,000 signatures</SelectItem>
                      <SelectItem value="2500">2,500 signatures</SelectItem>
                      <SelectItem value="5000">5,000 signatures</SelectItem>
                      <SelectItem value="10000">10,000 signatures</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Set a realistic goal based on your university's size and the scope of your
                    petition
                  </p>
                </div>

                {/* Guidelines Notice */}
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Community Guidelines</AlertTitle>
                  <AlertDescription className="text-sm">
                    By creating this petition, you agree to our community guidelines. Petitions must
                    be respectful, non-discriminatory, and focused on legitimate university issues.
                  </AlertDescription>
                </Alert>

                {/* Submit Button */}
                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={!isFormValid || isSubmitting} className="flex-1">
                    {isSubmitting ? "Creating Petition..." : "Publish Petition"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => window.history.back()}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Need help? Check out our{" "}
              <a href="#" className="text-primary hover:underline">
                guide to creating effective petitions
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
