import Nav from "@/components/nav"
import Link from "next/link"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Privacy Policy" }]} />

      <div className="max-w-3xl mx-auto py-12 px-6 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Privacy Policy</h1>
          <p className="text-zinc-500 mt-2 text-sm">Last updated: June 2026</p>
        </div>

        <p className="text-zinc-600">
          AtVeAnimation is operated by a single individual (the &ldquo;Operator&rdquo;) as an experimental AI service. This policy explains what personal data we collect and how it is used. By using AtVeAnimation you accept this policy in full.
        </p>

        <div className="rounded-lg bg-zinc-100 border border-zinc-200 px-5 py-4 text-sm text-zinc-700">
          <strong>Plain-language summary:</strong> We collect your email, photos, and voice recordings to run the service. We send that data to third-party AI providers (Replicate, fal.ai, Anthropic) who do the actual processing. We are a one-person operation. We store your data on Azure. Deleting your character or account triggers deletion of your Azure data within 30 days. We attempt to delete your trained AI model from Replicate but cannot guarantee their retention timelines.
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">1. Data We Collect</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p><span className="font-medium text-zinc-800">Account data.</span> Your name and email address when you register.</p>
            <p><span className="font-medium text-zinc-800">Photos.</span> The selfie you upload for cartoon generation. This image is stored in Azure Blob Storage and sent to Replicate for LoRA model training and to fal.ai for image-to-video generation.</p>
            <p><span className="font-medium text-zinc-800">Voice recordings.</span> Short audio samples you record live via your browser microphone. The raw recording is stored in Azure Blob Storage linked to your account. When you generate a video scene, the recording is transmitted to Replicate to run the XTTS-v2 voice cloning model, which extracts vocal characteristics to synthesize speech. The raw recording is retained until you delete your character or account, at which point it is deleted from our Azure storage. We do not use voice recordings to build permanent biometric profiles or for any purpose outside of generating your videos.</p>
            <p><span className="font-medium text-zinc-800">Scene prompts.</span> Text descriptions you write for scenes. These are sent to Anthropic&rsquo;s Claude for optional AI brief generation and content moderation. No biometric data is sent to Anthropic.</p>
            <p><span className="font-medium text-zinc-800">Generated content.</span> Cartoon images, video clips, and final videos stored in Azure Blob Storage and linked to your account.</p>
            <p><span className="font-medium text-zinc-800">Session data.</span> We use session cookies to keep you logged in. We do not use advertising cookies or cross-site tracking.</p>
            <p><span className="font-medium text-zinc-800">Usage logs.</span> Standard server logs (IP address, browser, timestamps). Used for debugging and security only.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">2. How We Use Your Data</h2>
          <p className="text-sm text-zinc-600">Your data is used exclusively to operate AtVeAnimation: generating cartoon images, training your personal AI model, cloning your voice, and producing animated videos. We do not sell your data, use it for advertising, or share it with any party other than the sub-processors listed in Section 3.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">3. Third-Party Processors and International Transfers</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>The following third-party services process your data. <strong>By using AtVeAnimation you acknowledge and accept that your data is transmitted to these services.</strong> AtVeAnimation is not responsible for their independent data handling practices.</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><span className="font-medium text-zinc-800">Replicate (replicate.com)</span> — Image generation, LoRA training, voice cloning. Your training images, voice samples, and trained LoRA model weights are stored on Replicate&rsquo;s servers. When you delete your character, we send a best-effort deletion request to Replicate; however, we cannot guarantee or control Replicate&rsquo;s internal retention timelines.</li>
              <li><span className="font-medium text-zinc-800">fal.ai</span> — Video generation. Generated images are transmitted to fal.ai for processing. Data is processed transiently and not permanently stored by fal.ai beyond their standard operational cache.</li>
              <li><span className="font-medium text-zinc-800">Microsoft Azure</span> — Hosts the application and stores all media files (photos, audio, generated videos). Data is stored in Azure Blob Storage.</li>
              <li><span className="font-medium text-zinc-800">Anthropic</span> — Scene text descriptions are processed by Claude for AI brief generation and content moderation. No photos or voice data are sent to Anthropic.</li>
            </ul>
            <p><strong>International data transfers.</strong> All third-party processors listed above are US-based companies. By using AtVeAnimation, users in the EU, UK, and Switzerland expressly acknowledge and consent to the transfer of their personal data, including voice recordings and facial images, to the United States for processing. Such transfers occur in connection with providing the service and are necessary for its operation.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">4. Biometric Data</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>Photos of your face and live voice recordings may constitute biometric data under laws including BIPA (Illinois), the Texas CUBI Act, the Washington My Health MY Data Act, CCPA (California), and GDPR (EU/UK). Voice data is classified as a biometric identifier when an AI model extracts unique vocal characteristics — which is what XTTS-v2 does. By recording your voice and uploading your photo, you explicitly consent to the collection, processing, transmission, and retention of your vocal characteristics and facial data to the processors listed in Section 3, solely to provide the service.</p>
            <p><strong>Retention deadline.</strong> We do not retain raw biometric data permanently. Biometric data stored in our Azure systems will be permanently deleted within 30 days of an account or character deletion request. For Replicate-hosted model weights, we send a deletion request upon character deletion; actual deletion timing is subject to Replicate&rsquo;s policies, and AtVeAnimation is not liable for their retention cycles beyond our best-effort request.</p>
            <p>We do not sell, license, or share biometric data with any party other than the processors listed in Section 3.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">5. Data Retention and Deletion</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>Your data is retained for as long as your account is active. When you delete a character, the following are deleted from Azure Blob Storage: your source photo, all cartoon style images, all training images, all generated scene images and videos, and all scene audio clips. When you delete your account, all remaining data is permanently removed from our active systems.</p>
            <p><strong>30-day buffer.</strong> Deletion from our systems will be completed within 30 days of a deletion request. This window accounts for edge cases, API failures, and operational constraints inherent in running a one-person service. Data is not actively used after deletion is initiated.</p>
            <p>Deletion from third-party processors (Replicate, fal.ai) is subject to their own policies. AtVeAnimation will make best-effort deletion requests to Replicate for trained model weights but cannot guarantee their timelines.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">6. Security</h2>
          <p className="text-sm text-zinc-600">
            We implement reasonable security measures including HTTPS and Azure access controls. <strong>No system is completely secure.</strong> AtVeAnimation is operated by a single individual without a dedicated security team, and you acknowledge this risk by using the service. In the event of a confirmed data breach affecting your personal information, we will make best efforts to notify you via your registered email address as expeditiously as possible given our operational capacity, and in accordance with applicable legal obligations. We cannot guarantee notification within any specific timeframe.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">7. Your Rights</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>Depending on your jurisdiction, you may have the right to access, correct, delete, or export your personal data, or to restrict or object to its processing. To exercise these rights, email contact@atveanimation.com. We will respond on a best-effort basis; as a one-person operation we cannot guarantee a specific response time.</p>
            <p>EU/UK users have rights under GDPR. California users have rights under CCPA. We honor these rights to the best of our operational ability.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">8. Children</h2>
          <p className="text-sm text-zinc-600">AtVeAnimation is for users aged 18 and over. We do not knowingly collect data from anyone under 18. If we become aware of such data, we will delete it promptly.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">9. Changes to This Policy</h2>
          <p className="text-sm text-zinc-600">We may update this policy at any time. Material changes will be reflected in an updated date at the top of this page. Continued use of the service after changes are posted constitutes acceptance.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">10. Contact</h2>
          <p className="text-sm text-zinc-600">For privacy questions, contact us at <span className="font-medium text-zinc-800">contact@atveanimation.com</span>. We will do our best to respond but cannot guarantee a response time.</p>
        </section>

        <div className="pt-4 border-t border-zinc-200">
          <Link href="/terms" className="text-sm text-violet-600 hover:underline">View Terms of Use →</Link>
        </div>
      </div>
    </div>
  )
}
