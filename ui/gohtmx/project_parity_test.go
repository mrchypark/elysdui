package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestProjectCallerParity(t *testing.T) {
	tpl, err := NewTemplates()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		chapter, name string
		props         map[string]any
		want          []string
	}{
		{"calendar", "EventCard", map[string]any{"Title": "Caller event", "Value": "event-key", "Start": "11:00", "End": "12:00", "Content": "Caller note", "Location": "Caller room"}, []string{"Caller event", "Caller note", "Caller room", `value="event-key"`, `data-ely-action="open-event"`}},
		{"calendar", "EventChip", map[string]any{"Title": "Caller chip", "Value": "chip"}, []string{"Caller chip", `value="chip"`}},
		{"project", "PriorityIndicator", map[string]any{"Value": "High", "Issue": "DEV-7"}, []string{`aria-label="Priority"`, `data-priority="High"`, "DEV-7"}},
		{"project", "IssueIdBadge", map[string]any{"Value": "Urgent", "Issues": []string{"TEAM-4"}}, []string{"TEAM-4", "Urgent"}},
		{"project", "StatusSelect", map[string]any{"Value": "custom-state", "Due": "2027-02-03", "Options": []map[string]any{{"Value": "custom-state", "Label": "Caller status"}, {"Value": "blocked", "Label": "Blocked", "Disabled": true}}, "Assignees": []map[string]any{{"Value": "person-7", "Label": "Caller person"}}, "AssigneeValue": "person-7"}, []string{`data-ely-submit="update-task"`, `value="custom-state" selected`, `value="person-7" selected`, `value="blocked" disabled`, `value="2027-02-03"`}},
		{"project", "AssigneePicker", map[string]any{"Assignee": "Caller owner"}, []string{"Caller owner", `name="assignee"`}},
		{"project", "DueDatePicker", map[string]any{"Due": "2027-05-01"}, []string{`name="due" value="2027-05-01"`}},
		{"project", "TaskItem", map[string]any{"Title": "Caller task", "Value": "task-key", "Priority": "High", "Status": "Done", "Done": true, "Due": "2027-03-04", "Content": "Keep description"}, []string{"Caller task", `data-task-id="task-key"`, "Keep description", `data-ely-task-done aria-label="Complete Caller task" checked`, "2027-03-04", "Done"}},
		{"project", "TaskList", map[string]any{"Items": []map[string]any{{"Value": "row-1", "Title": "First"}, {"Value": "row-2", "Title": "Second"}}, "Disabled": true}, []string{`data-task-id="row-1"`, `data-task-id="row-2"`, `aria-label="Complete First" disabled`}},
		{"project", "SubtaskList", map[string]any{"Title": "Caller checklist", "Completed": 1, "Items": []map[string]any{{"Value": "step-1", "Label": "Step", "Done": true}}}, []string{"Caller checklist", "1 of 1", `value="step-1"`, `data-ely-submit="add-subtask"`}},
		{"project", "Sprint Board", map[string]any{"Lanes": []map[string]any{{"Value": "caller-lane", "Label": "Caller lane", "Cards": []map[string]any{{"Value": "caller-card", "Title": "Caller card", "Content": "Description", "Priority": "High", "Due": "2027-04-01"}}}}}, []string{`data-lane-id="caller-lane"`, `data-card-id="caller-card"`, "Description", "2027-04-01", `data-ely-kanban-move`}},
		{"project", "SubtaskList", map[string]any{}, []string{"0 of 0", `max="1"`, `data-ely-submit="add-subtask"`}},
		{"project", "KanbanBoard", map[string]any{"Lanes": []map[string]any{{"Value": "empty", "Label": "Empty lane"}}}, []string{`data-lane-id="empty"`, `<output>0</output>`, "No tasks."}},
		{"project", "TaskDetailPanel", map[string]any{"Value": "detail-key", "Title": "<Caller title>", "Status": "In review", "Priority": "Medium", "Assignee": "Caller owner", "Notes": "Caller notes", "Content": "Caller body", "Due": "2027-02-03"}, []string{`data-task-id="detail-key"`, "&lt;Caller title&gt;", `<option selected>In review</option>`, `<option selected>Medium</option>`, "Caller owner", "Caller notes", "Caller body", `data-ely-action="edit"`}},
		{"project", "LabelManager", map[string]any{"Disabled": true, "Items": []map[string]any{{"Value": "label-1", "Label": "Caller label", "Hue": 3, "Content": "Caller detail"}}}, []string{`data-project-label="label-1"`, `value="Caller label"`, `data-calendar-hue="3"`, "Caller detail", `aria-label="Label name" disabled`}},
		{"project", "MilestoneProgress", map[string]any{"Title": "Caller milestone", "Progress": 37, "Content": "Caller progress"}, []string{"Caller milestone", `progress value="37"`, "Caller progress"}},
		{"project", "WorkloadView", map[string]any{"Items": []map[string]any{{"Title": "Caller load", "Value": 12, "Capacity": 8, "Content": "12 of 8 hours"}}}, []string{"Caller load", `max="8" value="12"`, "12 of 8 hours"}},
		{"project", "TimeTracker", map[string]any{"Value": "12:34", "Task": "Caller timer", "Entries": []map[string]any{{"Task": "Earlier task", "Seconds": 90, "Display": "1m"}}}, []string{"12:34", "Caller timer", "Earlier task", `data-ely-action="log-time"`}},
		{"project", "Pomodoro Timer", map[string]any{"Value": "07:00", "Progress": 68, "Phase": "Short break", "Rounds": 2}, []string{`data-ely-timer-progress="68"`, "07:00", "Short break", `data-rounds="2"`, `data-project-skip`, `data-ely-action="reset"`}},
		{"project", "DatabaseView", map[string]any{"Title": "Caller database", "Layout": "Gallery", "Items": []map[string]any{{"Value": "record-1", "Title": "Caller row", "Content": "Preserved metadata", "Status": "Todo", "Due": "2027-02-03"}}}, []string{"Caller database", `data-layout="Gallery"`, `data-project-record="record-1"`, "Caller row", "Preserved metadata", `value="Timeline"`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			if err := RenderComponent(tpl, &out, Component{Chapter: tc.chapter, Name: tc.name, ID: "project-caller", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(out.String(), want) {
					t.Errorf("missing %q in %s", want, out.String())
				}
			}
		})
	}
}
