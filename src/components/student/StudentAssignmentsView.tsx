import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Search,
  GraduationCap,
  Calendar,
  Award,
  Sparkles,
  Code2,
  FileCheck,
  RotateCcw,
  BookOpen,
  MessageSquareQuote,
  Paperclip,
  Download,
  Tag,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  lmsClient,
  type ClientAssignment,
  type ClientAssignmentAttachment,
} from "@/lib/lms-client";
import {
  getAssignmentDefinitions,
  getSubmissions,
  type AssignmentDefinition,
  type AssignmentSubmission,
} from "@/lib/lms-store";

export interface TargetAssignment {
  id: string;
  courseSlug: string;
  courseTitle: string;
  assignmentTitle: string;
  maxScore?: number;
  brief?: string;
  instructor?: string;
  attachments?: ClientAssignmentAttachment[];
}

interface StudentAssignmentsViewProps {
  openSubmitModal: (assignment: TargetAssignment) => void;
  dashboardData?: unknown;
  coursesList?: Array<{ slug: string; title: string; instructor: string }>;
}

export function StudentAssignmentsView({
  openSubmitModal,
  coursesList = [],
}: StudentAssignmentsViewProps) {
  const [assignmentDefs, setAssignmentDefs] = useState<AssignmentDefinition[]>([]);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"assigned" | "submissions">("assigned");

  const instructorBySlug: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {
      "advanced-typescript": "Sarah Chen",
      "system-design": "Marcus Vance",
      "react-performance": "Dan Abramov & Elena Rostova",
      dsa: "Dr. Arvind Rao",
    };
    coursesList.forEach((c) => {
      if (c.slug && c.instructor) {
        map[c.slug] = c.instructor;
      }
    });
    return map;
  }, [coursesList]);

  // Load assignments and submissions from backend API
  const loadData = useCallback(async () => {
    // Fast initial local store load
    const localDefs = getAssignmentDefinitions();
    if (localDefs.length > 0) {
      setAssignmentDefs(localDefs);
      setSubmissions(getSubmissions());
    }

    try {
      const res = await lmsClient.getAssignments();
      if (res?.assignments && Array.isArray(res.assignments)) {
        const backendDefs: AssignmentDefinition[] = res.assignments.map((a: ClientAssignment) => ({
          id: a.id,
          courseSlug: a.course_slug,
          courseTitle: a.course_title,
          title: a.title,
          description: a.description,
          dueDate: a.due_date,
          maxScore: a.max_score,
          submissionCount: a.submissionCount,
          instructor: a.instructor || instructorBySlug[a.course_slug] || "Faculty Lead",
          attachments: a.attachments,
          starterRepoUrl: a.starter_repo_url,
          tags: a.tags,
        }));

        setAssignmentDefs(backendDefs);

        // Map backend student submissions if returned
        const backendSubmissions: AssignmentSubmission[] = res.assignments
          .filter((a: ClientAssignment) => Boolean(a.studentSubmission))
          .map((a: ClientAssignment) => {
            const sub = a.studentSubmission!;
            return {
              id: sub.id,
              courseSlug: a.course_slug,
              courseTitle: a.course_title,
              assignmentId: a.id,
              assignmentTitle: a.title,
              studentId: "student",
              studentName: "Student Learner",
              studentEmail: "student@skillbridge.dev",
              githubUrl: sub.github_url,
              solutionNotes: sub.solution_notes || "",
              submittedAt: sub.submitted_at,
              status:
                sub.status === "approved"
                  ? ("approved" as const)
                  : sub.status === "resubmission_required"
                    ? ("needs_revision" as const)
                    : ("pending" as const),
              score: sub.score ?? undefined,
              feedback: sub.feedback ?? undefined,
            };
          });

        if (backendSubmissions.length > 0) {
          setSubmissions((prev) => {
            const map = new Map<string, AssignmentSubmission>();
            prev.forEach((s) => map.set(s.id, s));
            backendSubmissions.forEach((s) => map.set(s.id, s));
            return Array.from(map.values());
          });
        }
      }
    } catch (err) {
      console.warn("Backend assignments load fallback to local store:", err);
    } finally {
      setIsLoading(false);
    }
  }, [instructorBySlug]);

  useEffect(() => {
    loadData();

    window.addEventListener("lms_submissions_updated", loadData);
    window.addEventListener("lms_assignment_defs_updated", loadData);
    window.addEventListener("lms_data_updated", loadData);
    return () => {
      window.removeEventListener("lms_submissions_updated", loadData);
      window.removeEventListener("lms_assignment_defs_updated", loadData);
      window.removeEventListener("lms_data_updated", loadData);
    };
  }, [loadData]);

  // Merge instructor assignments with student submission status
  const assignmentsWithStatus = useMemo(() => {
    return assignmentDefs.map((def) => {
      const sub = submissions
        .filter(
          (s) =>
            s.assignmentId === def.id ||
            (s.courseSlug === def.courseSlug && s.assignmentTitle === def.title),
        )
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

      const instructor = def.instructor || instructorBySlug[def.courseSlug] || "Faculty Instructor";

      let status: "unsubmitted" | "pending" | "approved" | "needs_revision" = "unsubmitted";
      if (sub) {
        if (sub.status === "approved") status = "approved";
        else if (sub.status === "needs_revision") status = "needs_revision";
        else status = "pending";
      }

      return {
        ...def,
        instructor,
        status,
        submission: sub || null,
      };
    });
  }, [assignmentDefs, submissions, instructorBySlug]);

  // Filtered by search, status, and course
  const filteredAssignments = useMemo(() => {
    return assignmentsWithStatus.filter((item) => {
      if (selectedStatus !== "all" && item.status !== selectedStatus) {
        return false;
      }
      if (selectedCourse !== "all" && item.courseSlug !== selectedCourse) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesCourse = item.courseTitle.toLowerCase().includes(q);
        const matchesInstructor = item.instructor.toLowerCase().includes(q);
        const matchesTags = item.tags?.some((t) => t.toLowerCase().includes(q)) || false;
        return matchesTitle || matchesDesc || matchesCourse || matchesInstructor || matchesTags;
      }
      return true;
    });
  }, [assignmentsWithStatus, selectedStatus, selectedCourse, searchQuery]);

  // KPIs
  const totalAssigned = assignmentsWithStatus.length;
  const pendingCount = assignmentsWithStatus.filter((a) => a.status === "unsubmitted").length;
  const inReviewCount = assignmentsWithStatus.filter((a) => a.status === "pending").length;
  const approvedCount = assignmentsWithStatus.filter((a) => a.status === "approved").length;

  const coursesWithAssignments = useMemo(() => {
    const set = new Map<string, string>();
    assignmentDefs.forEach((a) => set.set(a.courseSlug, a.courseTitle));
    return Array.from(set.entries()).map(([slug, title]) => ({ slug, title }));
  }, [assignmentDefs]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <GraduationCap className="size-3.5" />
              <span>Assigned by Faculty Instructors</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Assignments & Capstone Projects
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Curated engineering challenges provided by your faculty instructors. Review the requirements,
              download instructor materials, submit your project solutions, and receive verified feedback.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              loadData();
            }}
            disabled={isLoading}
            className="self-start sm:self-auto text-xs gap-1.5 cursor-pointer"
          >
            <RotateCcw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Sync Latest</span>
          </Button>
        </div>

        {/* Quick KPI stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card/60 p-3.5 backdrop-blur-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Assigned Projects
              </span>
              <ClipboardList className="size-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-black text-foreground">{totalAssigned}</p>
            <p className="text-[11px] text-muted-foreground">Provided by instructors</p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-3.5 backdrop-blur-xs">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">To Submit</span>
              <Clock className="size-4" />
            </div>
            <p className="mt-2 text-2xl font-black text-foreground">{pendingCount}</p>
            <p className="text-[11px] text-muted-foreground">Awaiting your solution</p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-3.5 backdrop-blur-xs">
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">In Review</span>
              <Sparkles className="size-4" />
            </div>
            <p className="mt-2 text-2xl font-black text-foreground">{inReviewCount}</p>
            <p className="text-[11px] text-muted-foreground">Faculty evaluating</p>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-3.5 backdrop-blur-xs">
            <div className="flex items-center justify-between text-teal-600 dark:text-teal-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Approved</span>
              <CheckCircle2 className="size-4" />
            </div>
            <p className="mt-2 text-2xl font-black text-foreground">{approvedCount}</p>
            <p className="text-[11px] text-muted-foreground">Verified & graded</p>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("assigned")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "assigned"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <BookOpen className="size-3.5" />
            <span>Assigned Projects ({assignmentsWithStatus.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("submissions")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "submissions"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <FileCheck className="size-3.5" />
            <span>Instructor Reviews & Submissions ({submissions.length})</span>
          </button>
        </div>
      </div>

      {/* Main Tab 1: Assigned Projects */}
      {activeTab === "assigned" && (
        <div className="space-y-4">
          {/* Controls: Search & Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search projects, topics, courses, or instructor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Course filter */}
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="h-8.5 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground font-medium"
              >
                <option value="all">All Courses ({coursesWithAssignments.length})</option>
                {coursesWithAssignments.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>

              {/* Status pills */}
              <div className="inline-flex rounded-lg border border-border bg-card p-1 text-xs">
                <button
                  onClick={() => setSelectedStatus("all")}
                  className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                    selectedStatus === "all"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedStatus("unsubmitted")}
                  className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                    selectedStatus === "unsubmitted"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  To Submit
                </button>
                <button
                  onClick={() => setSelectedStatus("pending")}
                  className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                    selectedStatus === "pending"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  In Review
                </button>
                <button
                  onClick={() => setSelectedStatus("approved")}
                  className={`rounded-md px-2.5 py-1 font-medium cursor-pointer ${
                    selectedStatus === "approved"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Approved
                </button>
              </div>
            </div>
          </div>

          {/* Loading indicator */}
          {isLoading && assignmentsWithStatus.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto size-8 animate-spin text-primary mb-2" />
              <p className="text-xs">Connecting to LMS server and loading instructor assignments...</p>
            </div>
          )}

          {/* Assignment Cards List */}
          {filteredAssignments.length === 0 && !isLoading ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
              <ClipboardList className="mx-auto size-10 text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-bold text-foreground">No assignments match your filter</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Try clearing your search query or switching filter tabs to see all projects assigned by
                instructors.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedStatus("all");
                  setSelectedCourse("all");
                }}
                className="mt-4 text-xs"
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredAssignments.map((assignment) => {
                const sub = assignment.submission;
                const isApproved = assignment.status === "approved";
                const isPending = assignment.status === "pending";
                const isRevision = assignment.status === "needs_revision";
                const isUnsubmitted = assignment.status === "unsubmitted";

                return (
                  <div
                    key={assignment.id}
                    className="group rounded-2xl border border-border bg-card p-5 sm:p-6 transition-all hover:border-primary/40 hover:shadow-xs"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      {/* Left: Metadata & Brief */}
                      <div className="space-y-3 flex-1 min-w-0">
                        {/* Course & Instructor badge */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-md bg-primary/10 px-2.5 py-1 font-bold text-primary">
                            {assignment.courseTitle}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                            <GraduationCap className="size-3.5 text-primary" />
                            Instructor:{" "}
                            <strong className="text-foreground">{assignment.instructor}</strong>
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="size-3.5" /> Due: {assignment.dueDate || "Flexible"}
                          </span>
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h2 className="text-lg font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                            {assignment.title}
                          </h2>
                          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                            {assignment.description}
                          </p>
                        </div>

                        {/* Instructor Materials & Attachments */}
                        {assignment.attachments && assignment.attachments.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1.5">
                            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                              <Paperclip className="size-3.5 text-primary" /> Instructor Materials:
                            </span>
                            {assignment.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                              >
                                <Download className="size-3" />
                                <span>{att.name}</span>
                                {att.size && (
                                  <span className="text-[10px] opacity-75">
                                    ({Math.round(att.size / 1024)} KB)
                                  </span>
                                )}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Starter Code Repository */}
                        {assignment.starterRepoUrl && (
                          <div className="flex items-center gap-2 pt-1">
                            <a
                              href={assignment.starterRepoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                            >
                              <Code2 className="size-3.5" />
                              <span>Starter Code Repository</span>
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                        )}

                        {/* Tags */}
                        {assignment.tags && assignment.tags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {assignment.tags.map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                <Tag className="size-2.5 text-primary/70" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Instructor Grading Rubric Info */}
                        <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Award className="size-3.5 text-amber-500" /> Max Score:{" "}
                            <strong>{assignment.maxScore} pts</strong>
                          </span>
                          <span>•</span>
                          <span>Evaluation: Faculty Code Review & Architecture Rubric</span>
                        </div>

                        {/* If student has submitted and received faculty feedback */}
                        {sub?.feedback && (
                          <div className="mt-3 rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 text-xs">
                            <div className="flex items-center justify-between text-teal-600 dark:text-teal-400 font-bold mb-1">
                              <span className="flex items-center gap-1.5">
                                <MessageSquareQuote className="size-4" /> Instructor Evaluation:
                              </span>
                              {sub.score !== undefined && (
                                <span className="rounded bg-teal-500/10 px-2 py-0.5 font-black text-teal-700 dark:text-teal-300">
                                  Grade: {sub.score} / {assignment.maxScore}
                                </span>
                              )}
                            </div>
                            <p className="text-muted-foreground leading-relaxed pl-5">
                              "{sub.feedback}"
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right: Status Pill & Action Button */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 shrink-0 pt-2 lg:pt-0">
                        {/* Status Badge */}
                        {isApproved && (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-600 dark:text-teal-400">
                            <CheckCircle2 className="size-3.5" />
                            <span>Passed & Graded ({sub?.score ?? assignment.maxScore}/{assignment.maxScore})</span>
                          </div>
                        )}

                        {isPending && (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <Clock className="size-3.5" />
                            <span>Under Faculty Review</span>
                          </div>
                        )}

                        {isRevision && (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-600 dark:text-red-400">
                            <AlertCircle className="size-3.5" />
                            <span>Revision Requested</span>
                          </div>
                        )}

                        {isUnsubmitted && (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                            <span>Not Submitted</span>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {isUnsubmitted && (
                            <Button
                              size="sm"
                              onClick={() => {
                                openSubmitModal({
                                  id: assignment.id,
                                  courseSlug: assignment.courseSlug,
                                  courseTitle: assignment.courseTitle,
                                  assignmentTitle: assignment.title,
                                  maxScore: assignment.maxScore,
                                  brief: assignment.description,
                                  instructor: assignment.instructor,
                                  attachments: assignment.attachments,
                                });
                              }}
                              className="w-full sm:w-auto text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
                            >
                              <Code2 className="size-3.5 mr-1.5" />
                              Submit Solution
                            </Button>
                          )}

                          {isRevision && (
                            <Button
                              size="sm"
                              onClick={() => {
                                openSubmitModal({
                                  id: assignment.id,
                                  courseSlug: assignment.courseSlug,
                                  courseTitle: assignment.courseTitle,
                                  assignmentTitle: assignment.title,
                                  maxScore: assignment.maxScore,
                                  brief: assignment.description,
                                  instructor: assignment.instructor,
                                  attachments: assignment.attachments,
                                });
                              }}
                              className="w-full sm:w-auto text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                            >
                              <RotateCcw className="size-3.5 mr-1.5" />
                              Resubmit Solution
                            </Button>
                          )}

                          {isPending && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                openSubmitModal({
                                  id: assignment.id,
                                  courseSlug: assignment.courseSlug,
                                  courseTitle: assignment.courseTitle,
                                  assignmentTitle: assignment.title,
                                  maxScore: assignment.maxScore,
                                  brief: assignment.description,
                                  instructor: assignment.instructor,
                                  attachments: assignment.attachments,
                                });
                              }}
                              className="w-full sm:w-auto text-xs cursor-pointer text-muted-foreground hover:text-foreground"
                            >
                              Update Solution
                            </Button>
                          )}

                          {isApproved && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActiveTab("submissions")}
                              className="w-full sm:w-auto text-xs cursor-pointer"
                            >
                              View Feedback
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Tab 2: Instructor Reviews & Submissions History */}
      {activeTab === "submissions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">
              Your Submission Log & Faculty Evaluations
            </h2>
            <span className="text-xs text-muted-foreground">
              Total Submissions: {submissions.length}
            </span>
          </div>

          {submissions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
              <FileCheck className="mx-auto size-10 text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-bold text-foreground">No submissions yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Once you submit a solution for an assignment, your submission history, score, and instructor
                feedback will appear here.
              </p>
              <Button
                size="sm"
                onClick={() => setActiveTab("assigned")}
                className="mt-4 text-xs cursor-pointer"
              >
                Browse Assigned Projects
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {submissions.map((sub) => {
                const isApproved = sub.status === "approved";
                const isRevision = sub.status === "needs_revision";
                const isPending = sub.status === "pending";

                return (
                  <div
                    key={sub.id}
                    className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-2xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-primary">{sub.courseTitle}</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            Submitted: {new Date(sub.submittedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-foreground mt-0.5">
                          {sub.assignmentTitle}
                        </h3>
                      </div>

                      {/* Status badge */}
                      <div>
                        {isApproved && (
                          <div className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-600 dark:text-teal-400">
                            <CheckCircle2 className="size-3.5" />
                            <span>Approved (Score: {sub.score ?? 100} pts)</span>
                          </div>
                        )}
                        {isPending && (
                          <div className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <Clock className="size-3.5" />
                            <span>Queued for Faculty Review</span>
                          </div>
                        )}
                        {isRevision && (
                          <div className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-600 dark:text-red-400">
                            <AlertCircle className="size-3.5" />
                            <span>Needs Revision</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Links & Details */}
                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      {sub.githubUrl && (
                        <div className="rounded-xl border border-border bg-secondary/30 p-3">
                          <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                            Repository Submitted
                          </span>
                          <a
                            href={sub.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline break-all"
                          >
                            <ExternalLink className="size-3.5 shrink-0" />
                            <span>{sub.githubUrl}</span>
                          </a>
                        </div>
                      )}

                      <div className="rounded-xl border border-border bg-secondary/30 p-3">
                        <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                          Candidate Notes / Architecture Summary
                        </span>
                        <p className="text-foreground leading-relaxed line-clamp-3">
                          {sub.solutionNotes || "No additional notes provided."}
                        </p>
                      </div>
                    </div>

                    {/* Faculty Feedback Section */}
                    {sub.feedback ? (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-primary font-bold">
                          <span className="flex items-center gap-1.5">
                            <GraduationCap className="size-4" /> Written Faculty Feedback
                          </span>
                          {sub.score !== undefined && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-black">
                              Score: {sub.score} / 100
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground leading-relaxed pl-5 italic">
                          "{sub.feedback}"
                        </p>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic flex items-center gap-2">
                        <Sparkles className="size-3.5 text-amber-500" />
                        <span>
                          Your instructor has received this submission and is reviewing your implementation.
                          Check back soon for grading and code feedback.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
