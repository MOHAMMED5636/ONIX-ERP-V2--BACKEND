# 📚 ERP System - Complete User Manual

## Welcome to Onix ERP System!

This comprehensive guide will teach you how to use all features of the ERP system step by step.

---

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Authentication](#login--authentication)
3. [Dashboard Overview](#dashboard-overview)
4. [Project Management](#project-management)
5. [Task Management](#task-management)
6. [Tender Management](#tender-management)
7. [Client Management](#client-management)
8. [Document Management](#document-management)
9. [Employee Management](#employee-management)
10. [Reports & Analytics](#reports--analytics)
11. [Settings & Profile](#settings--profile)
12. [Troubleshooting](#troubleshooting)

---

## 🚀 Getting Started

### System Requirements
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Internet connection
- Valid user account credentials

### Accessing the System
1. Open your web browser
2. Navigate to: `http://192.168.1.151:3000` (or your provided URL)
3. You'll see the login page

---

## 🔐 Login & Authentication

### Step 1: Enter Your Credentials

1. **Email/Username Field:**
   - Click on the email/username field
   - Type your email address (e.g., `admin@onixgroup.ae`)

2. **Password Field:**
   - Click on the password field
   - Type your password
   - Click the eye icon to show/hide password

3. **Role Selection:**
   - Select your role from the dropdown:
     - **ADMIN** - Full system access
     - **TENDER_ENGINEER** - Tender management access
     - **PROJECT_MANAGER** - Project management access
     - **EMPLOYEE** - Basic employee access

4. **Click Login Button:**
   - Click the "Login" or "Sign In" button
   - Wait for authentication (2-3 seconds)

### First Time Login

If this is your first login:
1. You may be prompted to change your password
2. Enter your current password
3. Enter your new password (must meet security requirements)
4. Confirm your new password
5. Click "Change Password"
6. You'll be redirected to the dashboard

### Forgot Password?

1. Click "Forgot Password?" link on login page
2. Enter your email address
3. Click "Send Reset Link"
4. Check your email for reset instructions
5. Follow the link to reset your password

### Logout

1. Click on your profile icon (top right corner)
2. Select "Logout" from the dropdown menu
3. You'll be redirected to the login page

---

## 📊 Dashboard Overview

### Understanding the Dashboard

The dashboard is your main control center. It shows:

#### 1. **Summary Cards** (Top Section)
- **Total Projects** - Number of active projects
- **Total Tasks** - Number of tasks assigned to you
- **Completed Tasks** - Tasks you've finished
- **Pending Tasks** - Tasks waiting for action

#### 2. **Quick Actions** (Top Bar)
- **+ New Project** - Create a new project
- **+ New Task** - Create a new task
- **Search** - Search for projects, tasks, or clients
- **Notifications** - View system notifications

#### 3. **Recent Activity** (Middle Section)
- Recent projects you're working on
- Recent tasks assigned to you
- Recent documents uploaded
- Recent comments and updates

#### 4. **Charts & Analytics** (Bottom Section)
- Project status breakdown (pie chart)
- Task completion trends (line chart)
- Team performance metrics
- Timeline view of upcoming deadlines

### Navigating the Dashboard

- **Click on any card** to see detailed information
- **Hover over charts** to see specific values
- **Use filters** to customize what you see
- **Refresh button** updates all data

---

## 📁 Project Management

### Creating a New Project

#### Step-by-Step:

1. **Click "+ New Project" button** (top right or dashboard)

2. **Fill in Project Details:**
   - **Project Name** (Required)
     - Enter a descriptive name
     - Example: "Dubai Marina Tower Construction"
   
   - **Reference Number** (Required)
     - Unique identifier for the project
     - Format: PRJ-001, PRJ-002, etc.
   
   - **PIN (Project Identification Number)** (Optional)
     - Internal project code
   
   - **Client** (Optional)
     - Select from dropdown or create new
   
   - **Project Manager** (Optional)
     - Assign a project manager
   
   - **Start Date** (Optional)
     - Click calendar icon to select date
   
   - **End Date** (Optional)
     - Click calendar icon to select date
   
   - **Deadline** (Optional)
     - Project deadline date
   
   - **Plan Days** (Optional)
     - Estimated duration in days
   
   - **Status** (Required)
     - Select: Open, In Progress, On Hold, Completed, Cancelled, Closed
   
   - **Description** (Optional)
     - Detailed project description
   
   - **Remarks** (Optional)
     - Additional notes
   
   - **Assignee Notes** (Optional)
     - Notes for team members

3. **Assign Team Members:**
   - Click "Add Team Members"
   - Select employees from the list
   - Choose their role (Engineer, Manager, etc.)
   - Click "Add"

4. **Click "Create Project"**
   - Project will be created
   - You'll be redirected to project details page

### Viewing Projects

#### List View:
1. Click "Projects" in the main menu
2. You'll see a table with all projects
3. **Columns shown:**
   - PIN
   - Project Name
   - Project Manager
   - Client
   - Reference Number
   - Status
   - Timeline (Start - End dates)
   - Plan Days
   - Remarks
   - Actions

#### Filtering Projects:
- **By Status:** Click status filter dropdown
- **By Client:** Select client from filter
- **By Project Manager:** Select manager from filter
- **By Date Range:** Select start and end dates
- **Search:** Type in search box to find by name or reference

#### Sorting:
- Click any column header to sort
- Click again to reverse order
- Multiple clicks cycle through: Ascending → Descending → None

### Project Details Page

When you click on a project, you'll see:

#### 1. **Project Information Tab**
- All project details
- Client information
- Team members assigned
- Project timeline

#### 2. **Tasks Tab**
- All tasks related to this project
- Create new tasks
- Filter tasks by status
- View task details

#### 3. **Documents Tab**
- Upload project documents
- View/download files
- Organize by category
- Version history

#### 4. **Checklist Tab**
- Project checklist items
- Mark items as complete
- Add new checklist items
- Track progress

#### 5. **Attachments Tab**
- Project files and images
- Upload new attachments
- Download files
- Delete old files

#### 6. **Timeline Tab**
- Project milestones
- Important dates
- Deadline tracking
- Gantt chart view

### Editing a Project

1. **Open the project** you want to edit
2. **Click "Edit" button** (top right)
3. **Modify any fields** you need to change
4. **Click "Save Changes"**
5. Changes are saved immediately

### Deleting a Project

⚠️ **Warning:** This action cannot be undone!

1. Open the project
2. Click "Delete" button (usually red, bottom of page)
3. Confirm deletion in popup
4. Project will be permanently deleted

### Project Status Management

#### Changing Project Status:

1. **Open the project**
2. **Click on current status** (dropdown)
3. **Select new status:**
   - **Open** - Project just started
   - **In Progress** - Active work ongoing
   - **On Hold** - Temporarily paused
   - **Completed** - Project finished
   - **Cancelled** - Project cancelled
   - **Closed** - Project closed/archived
4. **Status updates automatically**

---

## ✅ Task Management

### Creating a New Task

#### Step-by-Step:

1. **Click "+ New Task" button**
   - From dashboard or project page

2. **Fill in Task Details:**
   - **Title** (Required)
     - Brief task description
     - Example: "Review structural drawings"
   
   - **Description** (Optional)
     - Detailed task information
     - Include requirements and expectations
   
   - **Project** (Required)
     - Select which project this task belongs to
   
   - **Status** (Required)
     - Default: Pending
     - Options: Pending, In Progress, Completed, Cancelled, On Hold
   
   - **Priority** (Required)
     - Default: Medium
     - Options: Low, Medium, High, Urgent
   
   - **Start Date** (Optional)
     - When task should begin
   
   - **Due Date** (Optional)
     - Task deadline
   
   - **Estimated Hours** (Optional)
     - How long you think it will take
   
   - **Tags** (Optional)
     - Add tags for organization
     - Example: "urgent", "review", "design"

3. **Assign Team Members:**
   - Click "Assign To"
   - Select one or more employees
   - They'll receive notification

4. **Click "Create Task"**
   - Task is created
   - Assigned members are notified

### Viewing Tasks

#### Task List View:
1. Click "Tasks" in main menu
2. See all your tasks in a table
3. **Columns:**
   - Task Title
   - Project
   - Status
   - Priority
   - Assigned To
   - Due Date
   - Progress
   - Actions

#### Task Views Available:

**1. Table View** (Default)
- Traditional list format
- Sortable columns
- Easy filtering

**2. Card View**
- Visual card layout
- See task details at a glance
- Color-coded by priority

**3. Kanban View** (Recommended)
- Drag and drop interface
- Columns: Pending, In Progress, Completed
- Move tasks between columns
- Visual workflow

**4. Calendar View**
- See tasks on calendar
- Filter by date range
- See deadlines clearly

### Task Details Page

When you click on a task:

#### 1. **Task Information**
- Full task description
- Project it belongs to
- Status and priority
- Dates and timeline
- Assigned team members

#### 2. **Checklist**
- Add checklist items
- Check off completed items
- Track sub-tasks

#### 3. **Comments**
- Add comments and updates
- Tag team members (@username)
- Attach files to comments
- View comment history

#### 4. **Attachments**
- Upload files related to task
- View/download attachments
- Organize by type

#### 5. **Activity Log**
- See all changes made
- Who made changes
- When changes occurred

### Updating Task Status

#### Method 1: From Task List
1. Find your task in the list
2. Click status dropdown
3. Select new status
4. Status updates immediately

#### Method 2: From Kanban Board
1. Open Kanban view
2. **Drag task** to new column
3. Drop it in desired status column
4. Status updates automatically

#### Method 3: From Task Details
1. Open the task
2. Click status dropdown (top right)
3. Select new status
4. Click "Save"

### Adding Comments to Tasks

1. **Open the task**
2. **Scroll to "Comments" section**
3. **Type your comment** in the text box
4. **Optional:** Attach a file
5. **Click "Post Comment"**
6. Comment appears immediately
7. Assigned members are notified

### Completing a Task

1. **Finish all work** on the task
2. **Mark checklist items** as complete
3. **Add final comment** if needed
4. **Change status** to "Completed"
5. **Task moves** to completed section
6. **Project manager** is notified

---

## 📋 Tender Management

### Viewing Tenders

1. **Click "Tenders"** in main menu
2. **See all tenders** in list
3. **Filter by:**
   - Status (Open, Closed, Awarded, etc.)
   - Project
   - Client
   - Date range

### Tender Details

When you open a tender:

#### Information Shown:
- Tender name and reference number
- Related project
- Client information
- Status
- Scope of work
- Deadlines (Acceptance & Submission)
- Invitation fees (if any)
- Technical drawings link
- Additional notes

### Accepting Tender Invitations

**For Tender Engineers:**

1. **Check notifications** (bell icon)
2. **Click on tender invitation**
3. **Review tender details**
4. **Click "Accept Invitation"**
5. **Confirm acceptance**
6. Tender appears in your assigned tenders

### Submitting Technical Submissions

1. **Open the tender** you're assigned to
2. **Click "Submit Technical Proposal"**
3. **Upload required documents:**
   - Technical drawings
   - Calculations
   - Specifications
   - Other required files
4. **Add notes** (optional)
5. **Click "Submit"**
6. Submission is sent for review

### Tracking Tender Status

- **Pending** - Waiting for your action
- **Under Review** - Your submission is being reviewed
- **Approved** - Submission accepted
- **Rejected** - Submission needs revision
- **Awarded** - Tender awarded to you
- **Closed** - Tender closed

---

## 👥 Client Management

### Viewing Clients

1. **Click "Clients"** in main menu
2. **See client list** with:
   - Client name
   - Reference number
   - Contact information
   - Associated projects
   - Status

### Adding a New Client

1. **Click "+ New Client"**
2. **Fill in client information:**
   - **Reference Number** (Required, unique)
   - **Name** (Required)
   - **Type:** Person or Company
   - **Email** (Optional)
   - **Phone** (Optional)
   - **Address** (Optional)
   - **Nationality** (Optional)
   - **ID Number** (Optional)
   - **Passport Number** (Optional)
   - **Birth Date** (Optional)
   - **Lead Source** (Optional)
   - **Rank** (Optional)
3. **Click "Create Client"**
4. Client is added to database

### Editing Client Information

1. **Open the client** you want to edit
2. **Click "Edit" button**
3. **Update any fields**
4. **Click "Save Changes"**

### Viewing Client Projects

1. **Open client details**
2. **Click "Projects" tab**
3. **See all projects** for this client
4. **Click project** to view details

---

## 📄 Document Management

### Uploading Documents

#### Method 1: From Project Page
1. **Open a project**
2. **Click "Documents" tab**
3. **Click "Upload Document"**
4. **Select file(s)** from your computer
5. **Fill in document details:**
   - Document type
   - Category
   - Description
6. **Click "Upload"**
7. Document appears in list

#### Method 2: From Task Page
1. **Open a task**
2. **Click "Attachments" tab**
3. **Click "Upload File"**
4. **Select file**
5. **Click "Upload"**

### Viewing Documents

1. **Navigate to Documents section**
2. **Use filters:**
   - By project
   - By document type
   - By date
   - By uploader
3. **Click document** to view
4. **Download** if needed

### Organizing Documents

- **Create folders** to organize
- **Add tags** for easy searching
- **Categorize** by type
- **Archive** old documents

### Document Types

Common document types:
- Contracts
- Drawings
- Reports
- Invoices
- Certificates
- Technical Submissions
- Meeting Minutes
- Other

---

## 👤 Employee Management

### Viewing Employees

**For Admins Only:**

1. **Click "Employees"** in main menu
2. **See employee list** with:
   - Name
   - Email
   - Role
   - Department
   - Status (Active/Inactive)
   - Actions

### Adding New Employee

1. **Click "+ Add Employee"**
2. **Fill in employee details:**
   - First Name (Required)
   - Last Name (Required)
   - Email (Required, unique)
   - Password (Required)
   - Role (Required)
   - Department (Optional)
   - Position (Optional)
   - Job Title (Optional)
   - Phone (Optional)
   - Employee ID (Optional)
3. **Upload photo** (optional)
4. **Click "Create Employee"**
5. Employee receives login credentials

### Editing Employee Information

1. **Open employee profile**
2. **Click "Edit"**
3. **Update information**
4. **Click "Save Changes"**

### Resetting Employee Password

1. **Open employee profile**
2. **Click "Reset Password"**
3. **Enter new password**
4. **Confirm password**
5. **Click "Reset"**
6. Employee must change password on next login

---

## 📊 Reports & Analytics

### Accessing Reports

1. **Click "Reports"** in main menu
2. **Select report type:**
   - Project Reports
   - Task Reports
   - Financial Reports
   - Employee Reports
   - Client Reports

### Project Reports

**Available Reports:**
- Project Status Summary
- Project Timeline Report
- Project Budget Report
- Project Completion Report
- Team Performance Report

**How to Generate:**
1. Select report type
2. Choose date range
3. Select projects (or all)
4. Click "Generate Report"
5. Report appears (can be exported)

### Task Reports

**Available Reports:**
- Task Completion Report
- Task Status Report
- Task Assignment Report
- Task Time Tracking Report

### Exporting Reports

1. **Generate the report**
2. **Click "Export" button**
3. **Choose format:**
   - PDF
   - Excel (XLSX)
   - CSV
4. **File downloads** to your computer

---

## ⚙️ Settings & Profile

### Updating Your Profile

1. **Click your profile icon** (top right)
2. **Select "Profile"**
3. **Edit information:**
   - Name
   - Email
   - Phone
   - Department
   - Position
   - Job Title
4. **Upload new photo** (optional)
5. **Click "Save Changes"**

### Changing Your Password

1. **Click profile icon**
2. **Select "Change Password"**
3. **Enter current password**
4. **Enter new password**
5. **Confirm new password**
6. **Click "Change Password"**
7. You'll be logged out and need to login again

### Notification Settings

1. **Click profile icon**
2. **Select "Settings"**
3. **Go to "Notifications" tab**
4. **Choose what notifications you want:**
   - Email notifications
   - Task assignments
   - Project updates
   - Comments
   - Deadline reminders
5. **Click "Save"**

### Language Settings

1. **Click profile icon**
2. **Select "Settings"**
3. **Go to "Language" tab**
4. **Select your preferred language**
5. **Click "Save"**
6. Interface updates immediately

---

## 🔍 Search & Filters

### Using Search

1. **Click search icon** (top bar)
2. **Type what you're looking for:**
   - Project name
   - Task title
   - Client name
   - Document name
   - Employee name
3. **Press Enter** or click search
4. **Results appear** below

### Advanced Search

1. **Click "Advanced Search"**
2. **Select category:**
   - Projects
   - Tasks
   - Clients
   - Documents
   - Employees
3. **Add filters:**
   - Date range
   - Status
   - Assigned to
   - Tags
4. **Click "Search"**

### Using Filters

**On any list page:**
1. **Click "Filters" button**
2. **Select filter options:**
   - Status
   - Date range
   - Assigned to
   - Priority
   - Tags
3. **Click "Apply Filters"**
4. **List updates** to show filtered results
5. **Click "Clear Filters"** to reset

---

## 📱 Mobile Access

### Using ERP on Mobile

The ERP system works on mobile devices:

1. **Open browser** on your phone/tablet
2. **Navigate to ERP URL**
3. **Login** with your credentials
4. **All features** are available
5. **Touch-friendly** interface

### Mobile Tips

- **Use landscape mode** for better viewing
- **Pinch to zoom** on charts and tables
- **Swipe** to navigate between tabs
- **Long press** for context menus

---

## 🆘 Troubleshooting

### Common Issues & Solutions

#### 1. Can't Login

**Problem:** Login button doesn't work or shows error

**Solutions:**
- Check email and password are correct
- Make sure role is selected correctly
- Check internet connection
- Clear browser cache
- Try different browser
- Contact administrator if problem persists

#### 2. Page Not Loading

**Problem:** Page takes too long or doesn't load

**Solutions:**
- Check internet connection
- Refresh page (F5 or Ctrl+R)
- Clear browser cache
- Try different browser
- Check if server is running

#### 3. Can't Upload Files

**Problem:** File upload fails

**Solutions:**
- Check file size (max 10MB usually)
- Check file type is allowed
- Try smaller file
- Check internet connection
- Try different file format

#### 4. Data Not Saving

**Problem:** Changes don't save

**Solutions:**
- Check internet connection
- Make sure all required fields are filled
- Check for error messages
- Refresh page and try again
- Contact administrator

#### 5. Can't See Projects/Tasks

**Problem:** List is empty or missing items

**Solutions:**
- Check filters aren't hiding items
- Clear all filters
- Check your permissions
- Refresh page
- Logout and login again

#### 6. Slow Performance

**Problem:** System is slow

**Solutions:**
- Close other browser tabs
- Clear browser cache
- Check internet speed
- Try different browser
- Contact IT support

---

## 💡 Tips & Best Practices

### General Tips

1. **Save Frequently**
   - Don't wait to save changes
   - Save as you work

2. **Use Filters**
   - Filter lists to find what you need
   - Save filter preferences

3. **Add Comments**
   - Comment on tasks and projects
   - Keep team informed
   - Document decisions

4. **Update Status**
   - Keep status current
   - Helps team see progress
   - Improves reporting

5. **Use Tags**
   - Tag projects and tasks
   - Makes searching easier
   - Organizes work

6. **Set Reminders**
   - Use due dates
   - Set calendar reminders
   - Don't miss deadlines

7. **Regular Updates**
   - Update tasks daily
   - Keep projects current
   - Communicate changes

### Keyboard Shortcuts

- **Ctrl + S** - Save
- **Ctrl + F** - Search
- **Esc** - Close dialog
- **Enter** - Submit form
- **Tab** - Move to next field

### Workflow Tips

**For Project Managers:**
- Review dashboard daily
- Check task status regularly
- Update project status weekly
- Review reports monthly

**For Tender Engineers:**
- Check invitations daily
- Respond to invitations quickly
- Submit proposals on time
- Track submission status

**For Employees:**
- Update task status regularly
- Add comments when needed
- Ask questions via comments
- Complete tasks on time

---

## 📞 Getting Help

### Support Options

1. **Help Documentation**
   - Click "Help" in menu
   - Search for topics
   - Browse guides

2. **Contact Administrator**
   - Email: admin@onixgroup.ae
   - Use "Contact Support" feature
   - Report issues immediately

3. **Training Sessions**
   - Request training
   - Attend scheduled sessions
   - Watch video tutorials

### Reporting Issues

When reporting issues, include:
- What you were trying to do
- What happened instead
- Error messages (if any)
- Screenshots (if possible)
- Browser and version
- Date and time

---

## ✅ Quick Reference Checklist

### Daily Tasks
- [ ] Login to system
- [ ] Check dashboard for updates
- [ ] Review assigned tasks
- [ ] Update task status
- [ ] Check notifications
- [ ] Add comments if needed

### Weekly Tasks
- [ ] Review project progress
- [ ] Update project status
- [ ] Check upcoming deadlines
- [ ] Review team updates
- [ ] Generate reports if needed

### Monthly Tasks
- [ ] Review monthly reports
- [ ] Update project timelines
- [ ] Archive completed projects
- [ ] Review and update profile
- [ ] Check system announcements

---

## 🎓 Training Resources

### Video Tutorials
- Getting Started (5 minutes)
- Project Management (10 minutes)
- Task Management (8 minutes)
- Reports & Analytics (7 minutes)

### Interactive Guides
- Step-by-step walkthroughs
- Practice exercises
- Quiz to test knowledge

### Documentation
- This user manual
- FAQ section
- API documentation (for developers)

---

## 🔒 Security Best Practices

1. **Password Security**
   - Use strong passwords
   - Don't share passwords
   - Change password regularly
   - Don't write passwords down

2. **Account Security**
   - Logout when done
   - Don't leave computer unattended
   - Lock screen when away
   - Report suspicious activity

3. **Data Security**
   - Don't share sensitive data
   - Use secure networks
   - Be careful with attachments
   - Follow company policies

---

## 📝 Glossary

**Project** - A major work initiative with defined goals and timeline

**Task** - A specific work item within a project

**Tender** - A formal invitation to submit a proposal

**Client** - A customer or company you work with

**Dashboard** - Main overview page showing key information

**Kanban** - Visual board showing work flow (columns: Pending, In Progress, Completed)

**Status** - Current state of a project or task

**Priority** - Importance level (Low, Medium, High, Urgent)

**Assignee** - Person assigned to work on a task

**Comment** - Note or message added to a task or project

**Attachment** - File uploaded to a project or task

**Checklist** - List of items to complete

**Filter** - Tool to narrow down displayed items

**Report** - Summary of data in various formats

---

## 🎉 Congratulations!

You now know how to use the ERP system! 

**Remember:**
- Practice makes perfect
- Don't hesitate to ask questions
- Use the help documentation
- Keep your data updated
- Enjoy using the system!

---

**Last Updated:** [Current Date]
**Version:** 1.0
**For Support:** admin@onixgroup.ae



