import Nav from "@/components/nav"
import Link from "next/link"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Terms of Use" }]} />

      <div className="max-w-3xl mx-auto py-12 px-6 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Terms of Use</h1>
          <p className="text-zinc-500 mt-2 text-sm">Last updated: June 2026</p>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-800">
          <strong>IMPORTANT — PLEASE READ CAREFULLY.</strong> By creating an account or using AtVeAnimation you agree to be bound by these Terms in their entirety. If you do not agree, you must not use the service. <strong>These Terms include a binding arbitration clause and class action waiver in Section 13 that affect how disputes are resolved.</strong>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">1. Eligibility</h2>
          <p className="text-sm text-zinc-600">You must be at least 18 years old to use AtVeAnimation. By registering, you represent and warrant that you are 18 or older. Accounts created by or for minors will be terminated immediately.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">2. Use at Your Own Risk</h2>
          <p className="text-sm text-zinc-600">
            <strong>YOU USE ATVEANIMATION ENTIRELY AT YOUR OWN RISK.</strong> The service is an experimental AI platform operated by a single individual with no team, no dedicated support staff, and no guarantee of uptime, accuracy, or fitness for any purpose. AI models are unpredictable by nature. Generated content may be inaccurate, incomplete, offensive, or unexpected. You are solely responsible for reviewing and deciding how to use any content you generate.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">3. Your Content, Likeness, and Consent</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>
              <span className="font-medium text-zinc-800">Your own likeness and voice only.</span> You may only upload photos and record voice audio of yourself, or of another real person who has given you explicit written consent. If you use any other person&rsquo;s likeness or voice, you represent and warrant that you have obtained their prior, explicit, written consent specifically authorizing their likeness and voice to be used on AtVeAnimation for AI-generated content. Uploading another person&rsquo;s likeness without this consent is a material breach of these Terms.
            </p>
            <p>
              <span className="font-medium text-zinc-800">No playback into the microphone.</span> The voice recording feature is designed for live, first-person voice capture only. You are strictly prohibited from using the microphone interface to record pre-recorded audio, broadcasts, media files, or the voice of any third party — including by playing audio through speakers or any other device into the microphone. Any such use is a violation of these Terms and may constitute identity fraud.
            </p>
            <p>
              <span className="font-medium text-zinc-800">Biometric voice consent.</span> By using the microphone recording feature, you explicitly consent to the collection, processing, and storage of your vocal characteristics solely for the purpose of generating AI-animated video narration within the service. We do not use your voice recordings to create permanent biometric profiles, sell your voice data, or use it for any purpose beyond generating your videos. Your raw voice recording is retained in Azure Blob Storage and associated with your account until you delete your character or account, at which point it is permanently deleted. During generation, your voice recording is transmitted to Replicate (XTTS-v2) for voice cloning; this transmission is covered by Replicate&rsquo;s privacy policy.
            </p>
            <p>
              <span className="font-medium text-zinc-800">Right to demand proof of consent.</span> AtVeAnimation reserves the right, at any time and for any reason, to demand that you provide documentary proof of any consent you claim to hold. Failure to produce such proof within 48 hours of a request will result in immediate account termination and removal of the relevant content.
            </p>
            <p>
              <span className="font-medium text-zinc-800">Indemnification for likeness and privacy claims.</span> If any claim is brought against AtVeAnimation by any third party arising from your use of their likeness, voice, image, or personal data — including claims under right-of-publicity laws, privacy laws, defamation law, or any other theory — you agree to fully defend, indemnify, and hold harmless AtVeAnimation and its operator from all resulting damages, costs, and legal fees, as further described in Section 8. This obligation survives termination of your account.
            </p>
            <p>
              <span className="font-medium text-zinc-800">You own your output.</span> You retain ownership of content you generate. By using the service you grant AtVeAnimation a limited, non-exclusive, royalty-free license to store and process your content solely to provide the service.
            </p>
            <p>
              <span className="font-medium text-zinc-800">You are responsible for your content.</span> AtVeAnimation does not monitor, review, or take responsibility for content you generate. Any use, sharing, or publication of generated content is entirely your own decision and your sole responsibility.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">4. Prohibited Content</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>You may not use AtVeAnimation to generate, store, or distribute content that is:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Sexually explicit, pornographic, or adult in nature</li>
              <li>Depicting or sexualizing minors in any way</li>
              <li>Using the likeness of any real person without their explicit written consent</li>
              <li>Intended to harass, defame, threaten, or harm any individual</li>
              <li>A deepfake designed to deceive, defraud, or manipulate</li>
              <li>Infringing any third party&rsquo;s intellectual property, privacy, or publicity rights</li>
              <li>Illegal under any applicable law</li>
              <li>Promoting violence, terrorism, or self-harm</li>
            </ul>
            <p>Violations will result in immediate account termination and may be reported to law enforcement. AtVeAnimation reserves the right to remove any content and terminate any account at any time, for any reason, without notice.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">5. Payments, Credits, and No Refunds</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>
              <strong>All purchases are final and non-refundable.</strong> Any fees, credits, or subscriptions purchased on AtVeAnimation are non-refundable, except where required by applicable law or as determined solely at AtVeAnimation&rsquo;s discretion. By completing a purchase you acknowledge and agree to this no-refund policy.
            </p>
            <p>
              If your account is suspended or terminated for violation of these Terms, you forfeit any unused credits or subscription time without refund. Initiating a chargeback or payment dispute in bad faith is a violation of these Terms and may result in a permanent ban and referral to collections.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">6. No Warranty — "As Is" Service</h2>
          <p className="text-sm text-zinc-600 uppercase font-medium">
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT ANY WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED AVAILABILITY. ATVEANIMATION MAKES NO WARRANTY THAT THE SERVICE WILL MEET YOUR REQUIREMENTS, PRODUCE ANY PARTICULAR OUTPUT, OR FUNCTION WITHOUT ERRORS OR INTERRUPTIONS.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">7. Limitation of Liability</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p className="uppercase font-medium">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ATVEANIMATION AND ITS OPERATOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES OF ANY KIND, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF REVENUE, LOSS OF PROFITS, LOSS OF GOODWILL, PERSONAL INJURY, OR ANY OTHER LOSS ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="uppercase font-medium">
              IN NO EVENT SHALL ATVEANIMATION&rsquo;S TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THESE TERMS OR THE SERVICE EXCEED THE GREATER OF (A) THE TOTAL AMOUNT YOU PAID TO ATVEANIMATION IN THE TWELVE MONTHS PRECEDING THE CLAIM OR (B) FIFTY US DOLLARS ($50).
            </p>
            <p>Some jurisdictions do not allow the exclusion or limitation of certain damages. In such jurisdictions, liability is limited to the minimum extent permitted by law.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">8. Indemnification</h2>
          <p className="text-sm text-zinc-600">
            You agree to defend, indemnify, and hold harmless AtVeAnimation and its operator from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising out of or relating to: (a) your use of the service; (b) content you upload or generate; (c) your violation of these Terms; (d) your violation of any third-party right, including intellectual property, privacy, or publicity rights; (e) your use of any other person&rsquo;s likeness or voice, whether or not you held valid consent; or (f) any claim that content you generated caused harm to a third party. This indemnification obligation is in addition to, and not a limitation of, any specific indemnification obligation stated in Section 3.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">9. AI-Generated Content</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>AtVeAnimation uses third-party AI models hosted by Replicate, fal.ai, and Anthropic. These models are operated independently; AtVeAnimation does not control their outputs and is not responsible for any content they produce.</p>
            <p>AI-generated content may be inaccurate, biased, or unexpected. You assume all responsibility for any content generated through your account, regardless of whether the output matches your intent.</p>
            <p>You acknowledge that your inputs (photos, voice recordings, text prompts) are transmitted to and processed by these third-party services, subject to their own terms and privacy policies.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">10. Copyright and DMCA</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>AtVeAnimation respects intellectual property rights and complies with the Digital Millennium Copyright Act (DMCA). If you believe that content on the service infringes your copyright, you may submit a written notice to us at <span className="font-medium text-zinc-800">contact@atveanimation.com</span> with the subject line &ldquo;DMCA Takedown Request&rdquo; including:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>A description of the copyrighted work you claim has been infringed</li>
              <li>A description of where the infringing content is located on the service</li>
              <li>Your contact information (name, address, phone, email)</li>
              <li>A statement that you have a good faith belief that the use is not authorized by the copyright owner, its agent, or the law</li>
              <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on their behalf</li>
              <li>Your physical or electronic signature</li>
            </ul>
            <p>Upon receiving a valid DMCA notice, AtVeAnimation will expeditiously remove or disable access to the allegedly infringing content and notify the user who uploaded it. Repeat infringers will have their accounts terminated.</p>
            <p>You may not upload, animate, or use any copyrighted image, artwork, or media as input to AtVeAnimation without authorization from the rights holder. Doing so is a violation of these Terms and applicable law.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">11. Termination</h2>
          <p className="text-sm text-zinc-600">AtVeAnimation may suspend or terminate your account at any time, for any reason or no reason, without notice or liability. You may stop using the service and delete your account at any time. Upon termination, your right to use the service ceases immediately. No refund of any fees or credits will be issued upon termination for cause.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">12. Service Availability and Intellectual Property</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>AtVeAnimation is operated by a single individual and is provided on a best-effort basis. The service may be interrupted, modified, or discontinued at any time without notice. AtVeAnimation has no obligation to maintain, support, or continue operating the service.</p>
            <p>The AtVeAnimation platform, branding, and code are proprietary. Nothing in these Terms grants you a right to use AtVeAnimation&rsquo;s name, logo, or trademarks. You may not copy, reverse-engineer, scrape, or create derivative works of the platform.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">13. Binding Arbitration and Class Action Waiver</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">PLEASE READ THIS SECTION CAREFULLY — IT AFFECTS YOUR LEGAL RIGHTS.</p>
            <p><strong>Informal resolution first.</strong> If you have a dispute with AtVeAnimation, you agree to first contact us at contact@atveanimation.com and attempt to resolve it informally for at least 30 days before initiating any formal proceeding.</p>
            <p><strong>Binding arbitration.</strong> If informal resolution fails, any dispute, claim, or controversy arising from or relating to these Terms or the service shall be finally resolved by binding individual arbitration under the rules of the American Arbitration Association (AAA), conducted in English. The arbitrator&rsquo;s decision shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.</p>
            <p><strong>Class action waiver.</strong> YOU AND ATVEANIMATION EACH AGREE THAT ANY CLAIM SHALL BE BROUGHT ONLY IN YOUR INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING. The arbitrator may not consolidate more than one person&rsquo;s claims.</p>
            <p><strong>Exception.</strong> Either party may bring an individual claim in small claims court, and either party may seek emergency injunctive relief in a court of competent jurisdiction to prevent irreparable harm pending arbitration.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">14. Governing Law</h2>
          <p className="text-sm text-zinc-600">These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict-of-law provisions. To the extent court proceedings are permitted under these Terms, you consent to the exclusive jurisdiction of the state and federal courts located in Delaware. <em>Note: this jurisdiction should be updated to match the state of incorporation when the operator formally incorporates the business.</em></p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">15. Email Communications</h2>
          <div className="space-y-3 text-sm text-zinc-600">
            <p>By creating an account on AtVeAnimation, you agree to receive transactional and service emails from us at the email address you registered with. These include emails related to your account security (password resets, login notifications), service updates, and important notices about changes to these Terms or the platform.</p>
            <p>From time to time we may also send you product updates, new feature announcements, and other communications about the service. You may opt out of non-transactional emails at any time by contacting us at <span className="font-medium text-zinc-800">contact@atveanimation.com</span>. You cannot opt out of transactional emails (such as password reset emails) while your account is active, as these are necessary to operate the service.</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">16. Changes to These Terms</h2>
          <p className="text-sm text-zinc-600">AtVeAnimation may update these Terms at any time by posting the revised version with an updated date. For material changes, we will make reasonable efforts to notify active users via a notice within the application or by email. Continued use of the service after the updated Terms are posted constitutes your acceptance of the changes.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-zinc-800 border-b border-zinc-200 pb-2">17. Contact</h2>
          <p className="text-sm text-zinc-600">All questions, notices, DMCA requests, and legal correspondence should be sent to <span className="font-medium text-zinc-800">contact@atveanimation.com</span>. We will do our best to respond but cannot guarantee a response time.</p>
        </section>

        <div className="pt-4 border-t border-zinc-200">
          <Link href="/privacy" className="text-sm text-violet-600 hover:underline">View Privacy Policy →</Link>
        </div>
      </div>
    </div>
  )
}
