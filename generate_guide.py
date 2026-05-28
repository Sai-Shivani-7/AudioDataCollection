import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8.5)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (on all pages except page 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "DOCTOR WORKFLOW GUIDE: SPEECH ANALYSIS PLATFORM")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(54, 742, 558, 742)
            
        # Footer (on all pages)
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 35, page_text)
        self.drawString(54, 35, "CONFIDENTIAL - CLINICAL REFERENCE SYSTEM")
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, 47, 558, 47)
        
        self.restoreState()

def build_pdf(filename="Doctor_Speech_Analysis_Workflow_Guide.pdf"):
    # Target printable area: letter is 612 x 792 points.
    # Margins: Left=54 (0.75in), Right=54, Top=72 (1in), Bottom=72 (1in)
    # Width = 612 - 108 = 504 points.
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=72,
        bottomMargin=72
    )

    styles = getSampleStyleSheet()

    # Define color scheme
    primary_color = colors.HexColor("#1e293b")   # Slate 800 (Dark Slate)
    secondary_color = colors.HexColor("#0f766e") # Teal 700 (Teal Accent)
    text_color = colors.HexColor("#334155")      # Slate 700 (Charcoal Body)
    accent_color = colors.HexColor("#b45309")    # Amber 700 (Alert/Info Accent)
    success_color = colors.HexColor("#047857")   # Emerald 700 (Success Green)
    bg_light = colors.HexColor("#f8fafc")        # Slate 50 (Callout Background)
    border_color = colors.HexColor("#e2e8f0")    # Slate 200 (Borders)

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=primary_color,
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=secondary_color,
        spaceAfter=15
    )

    h1_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=primary_color,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=text_color,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'BulletText',
        parent=body_style,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    step_style = ParagraphStyle(
        'StepText',
        parent=body_style,
        leftIndent=20,
        firstLineIndent=-15,
        spaceAfter=5
    )

    substep_style = ParagraphStyle(
        'SubStepText',
        parent=body_style,
        leftIndent=35,
        firstLineIndent=-12,
        spaceAfter=3,
        fontSize=9,
        leading=12.5
    )

    story = []

    # Title Block
    story.append(Paragraph("Doctor's Operational & Workflow Guide", title_style))
    story.append(Paragraph("SPEECH ANALYSIS COLLECTION & REPORTING PLATFORM", subtitle_style))
    
    # Divider line
    divider = Table([[""]], colWidths=[504], rowHeights=[2])
    divider.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), secondary_color),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(divider)
    story.append(Spacer(1, 10))

    # Introduction
    intro_text = (
        "This document details the step-by-step workflow for clinicians and research administrators "
        "operating the Speech Analysis Platform. The system is designed to securely capture high-fidelity patient "
        "speech recordings, store raw voice data in organized archives, process linguistic and syntactic features, "
        "and generate a machine-learning-assisted classification report."
    )
    story.append(Paragraph(intro_text, body_style))

    # Essential Reference Callout Box
    ref_text = (
        "<b>CRITICAL PLATFORM SYSTEM ACCESS CODES:</b><br/>"
        "&bull; <b>Default Access Portal URL:</b> http://localhost:5173<br/>"
        "&bull; <b>Doctor Action Authorization Code:</b> <font color='#b45309'><b>123456</b></font> (Required to View Reports & Generate Analysis)<br/>"
        "&bull; <b>Standard Audio Output Format:</b> PCM 16-bit WAV (Single channel, mono format)"
    )
    
    ref_paragraph = Paragraph(ref_text, ParagraphStyle('Callout', parent=styles['Normal'], fontSize=9, leading=13, textColor=primary_color))
    ref_table = Table([[ref_paragraph]], colWidths=[504])
    ref_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg_light),
        ('BOX', (0,0), (-1,-1), 1, border_color),
        ('LINELEFT', (0,0), (-1,-1), 3.5, secondary_color),
        ('PADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(ref_table)
    story.append(Spacer(1, 10))

    # Phase 1: User Sign Up & Authentication
    story.append(Paragraph("Phase 1: Doctor Authentication & Account Setup", h1_style))
    story.append(Paragraph("Before initiating patient recording sessions, doctors must establish secure portal access:", body_style))
    
    story.append(Paragraph("<b>1. Navigate to the Portal:</b> Open a standard web browser (Chrome or Edge recommended) and navigate to the application address (typically <b>http://localhost:5173</b>).", step_style))
    story.append(Paragraph("<b>2. Account Creation:</b> If you do not possess an account, toggle the authentication card to <i>'Need an account? Sign up'</i> to open the registration view.", step_style))
    story.append(Paragraph("&bull; Enter your Full Name, Email, and a secure password.<br/>&bull; Click <b>'Sign Up'</b>. The system automatically registers you with clinical administrator permissions.", substep_style))
    story.append(Paragraph("<b>3. Alternative Google Auth:</b> If Google OAuth is enabled in the configuration variables (VITE_GOOGLE_CLIENT_ID), you may select <b>'Sign in with Google'</b> for secure, single-sign-on access.", step_style))
    story.append(Paragraph("<b>4. Session Storage:</b> Upon successful login, the system stores your session credentials locally to ensure uninterrupted workflow across browser tabs.", step_style))
    
    story.append(Spacer(1, 6))

    # Phase 2: Patient Registration
    story.append(Paragraph("Phase 2: Initiating a Patient Recording Session", h1_style))
    story.append(Paragraph("The system requires a strict registration of patient profile details to maintain data integrity:", body_style))
    
    story.append(Paragraph("<b>1. Enter Patient Profile Panel:</b> Locate and click the <b>'Record Patient'</b> button in the top navigation bar or header dashboard. This redirects the browser to the recording view.", step_style))
    story.append(Paragraph("<b>2. Input Patient Identity:</b> Fill out the profile fields in the Patient Profile Panel:<br/>"
                           "&bull; <b>Patient Name:</b> Enter the patient's full name or standard identifier. <i>(Required - The recording interface remains locked until a name is input).</i><br/>"
                           "&bull; <b>Contact or Patient ID:</b> Enter a secondary identifier (such as a phone number, email address, or database GUID) for secure record-matching.", step_style))
    story.append(Paragraph("<b>3. Starting a Fresh Session:</b> If you need to clear all active inputs to register a new patient, click the <b>'New Patient'</b> button in the top right corner. This generates a unique internal session ID and resets all state variables.", step_style))

    story.append(Spacer(1, 6))

    # Phase 3: Voice Data Collection Workflow
    story.append(Paragraph("Phase 3: Standardized Audio Recording Protocol", h1_style))
    story.append(Paragraph("The audio collection follows a structured, three-prompt verbal stepper. The doctor must facilitate the session with the patient:", body_style))
    
    story.append(Paragraph("<b>1. Guide the Stepper Progression:</b> The stepper (numbered 1, 2, and 3) corresponds to three separate clinical questions designed to evaluate speech characteristics.", step_style))
    story.append(Paragraph("<b>2. The Structured Speech Prompts:</b>", step_style))
    story.append(Paragraph("&bull; <b>Prompt 1 (Introduction):</b> <i>'Please introduce yourself and describe how your day has been so far.'</i>", substep_style))
    story.append(Paragraph("&bull; <b>Prompt 2 (Memory Recall):</b> <i>'Please describe a recent conversation or social interaction you remember clearly.'</i>", substep_style))
    story.append(Paragraph("&bull; <b>Prompt 3 (Executive Planning):</b> <i>'Please explain what you would do if you had to plan a simple trip for tomorrow.'</i>", substep_style))
    
    story.append(Paragraph("<b>3. Perform the Recording Steps (Repeat for Prompts 1, 2, and 3):</b>", step_style))
    story.append(Paragraph("a. Click the <b>'Start Recording'</b> button. If prompted by the web browser, grant microphone access.", substep_style))
    story.append(Paragraph("b. Observe the pulsing red status indicator. Instruct the patient to speak clearly into the microphone.", substep_style))
    story.append(Paragraph("c. Monitor the <b>Live Transcript</b> panel. Real-time text will stream as the patient speaks (requires internet-connected Web Speech API).", substep_style))
    story.append(Paragraph("d. Once the response is fully completed, click the <b>'Stop Recording'</b> button.", substep_style))
    story.append(Paragraph("e. If the audio is unclear, clipped, or incorrect, click the <b>'Re-record'</b> button to repeat the step.", substep_style))
    story.append(Paragraph("f. Click <b>'Save and Next'</b>. The system converts raw browser audio into 16-bit WAV, sends it to the backend server, and updates the stepper. The backend compiles the audio into a ZIP file uploaded to Google Drive.", substep_style))
    
    story.append(Paragraph("<b>4. Complete the Protocol:</b> Once all three prompts are completed, a completion modal will display. Click <b>'Go to Dashboard'</b> to return to the admin panel or <b>'Record Another Patient'</b> to clear the form.", step_style))

    story.append(Spacer(1, 10))

    # Phase 4: Report Generation & Biomarker Analysis
    # Let's keep Phase 4 and 5 together or make sure we don't overflow pages haphazardly.
    p4_story = []
    p4_story.append(Paragraph("Phase 4: ML Report Generation & Biomarker Extraction", h1_style))
    p4_story.append(Paragraph("Once a patient's recordings are saved, the doctor must compile the data into an analysis report:", body_style))
    
    story.append(KeepTogether([
        Paragraph("Phase 4: ML Report Generation & Biomarker Extraction", h1_style),
        Paragraph("Once a patient's recordings are saved, the doctor must compile the data into an analysis report:", body_style),
        Paragraph("<b>1. Locate the Patient Row:</b> On the Admin Dashboard (<b>/admin</b>), find the patient's entry in the <i>Voice Submissions</i> table. The 'Stored Responses' column will display saved status for Q1, Q2, and Q3.", step_style),
        Paragraph("<b>2. Initiate Generation:</b> Click the <b>'Generate'</b> button (or <b>'Regenerate'</b> to update an existing analysis).", step_style),
        Paragraph("<b>3. Enter Doctor Code:</b> When prompted by the secure modal overlay, input the Doctor Access Code <b>123456</b> and click <b>'Confirm'</b>. This serves as a secondary gate for clinical data processing.", step_style),
        Paragraph("<b>4. Processing Pipeline:</b> The backend ML engine parses the concatenated transcript of the patient's answers and extracts 16 acoustic and syntactic metrics (biomarkers) including:", step_style),
        Paragraph("&bull; <b>Lexical Diversity:</b> Type-Token Ratio, Word Entropy, Bigram Diversity (lexical richness).<br/>"
                               "&bull; <b>Speech Flow:</b> Repetition Rate, Disfluency Ratio (frequency of fillers like 'um', 'uh', 'like').<br/>"
                               "&bull; <b>Syntactic Structures:</b> Mean Sentence Length, Syntactic Depth, Sentence Fragmentation, Clause Ratio.<br/>"
                               "&bull; <b>Semantic Coherence:</b> Length Drift, Sentence Length Standard Deviation, Semantic Coherence.", substep_style),
    ]))
    
    # Phase 5: Reviewing Clinical Interpretation
    story.append(Spacer(1, 6))
    
    story.append(KeepTogether([
        Paragraph("Phase 5: Reviewing Clinical Interpretation & Output", h1_style),
        Paragraph("After report compilation, doctors can view the visual interpretation screen:", body_style),
        Paragraph("<b>1. Open Report Card:</b> Click the newly enabled <b>'View Report'</b> button on the dashboard row, and re-authenticate using the access code <b>123456</b>.", step_style),
        Paragraph("<b>2. Review Diagnostic Summary:</b> The top panel showcases the machine classification:<br/>"
                               "&bull; <b>Typical Speech Pattern:</b> Metrics are within normal limits (probability score below threshold of 0.45).<br/>"
                               "&bull; <b>Atypical Speech Pattern:</b> High occurrence of flagged biomarkers (probability score &ge; 0.45).<br/>"
                               "&bull; <b>Uncertain:</b> Speech metrics fall within the uncertainty buffer (&plusmn;0.08 margin around 0.45). Recommended for review.", step_style),
        Paragraph("<b>3. Analyze the Biomarker Table:</b> The report displays a tabular view showing the exact values for each of the 16 features compared to their reference values (e.g. repetition rate &lt; 0.35, disfluency &lt; 0.1). Any parameter violating normal limits is automatically highlighted with a <b>HIGH</b> or <b>LOW</b> flag.", step_style),
        Paragraph("<b>4. Inspect Qualitative Findings:</b> Read through the extracted <b>Linguistic Findings</b>, <b>Syntactic Findings</b>, and <b>Clinical Interpretation</b> paragraphs detailing self-referential speech, negative valence, or structural syntactic gaps.", step_style),
        Paragraph("<b>5. Download Core Assets:</b> At the bottom of the page, the doctor can access download links for:<br/>"
                               "&bull; The combined text transcripts.<br/>"
                               "&bull; The raw classification data files.<br/>"
                               "&bull; A comprehensive ZIP archive stored in Google Drive containing the complete record set.", step_style)
    ]))

    # Disclaimer note
    story.append(Spacer(1, 10))
    disclaimer_text = (
        "<b>IMPORTANT NOTICE:</b> This software is a research prototype. It is NOT validated for clinical "
        "diagnosis or treatment decisions. All classifications, probability scores, and biomarker flags are for "
        "investigational use only and must be interpreted in conjunction with standard clinical diagnostics by "
        "a licensed professional."
    )
    disclaimer_paragraph = Paragraph(disclaimer_text, ParagraphStyle('Disclaimer', parent=styles['Normal'], fontSize=8, leading=11, textColor=colors.HexColor("#dc2626")))
    disclaimer_table = Table([[disclaimer_paragraph]], colWidths=[504])
    disclaimer_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#fef2f2")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#fca5a5")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(KeepTogether([disclaimer_table]))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"PDF generated successfully: {filename}")

if __name__ == "__main__":
    build_pdf()
