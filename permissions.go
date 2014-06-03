package main

const (
	permissionsDS = "core/permission.ds"
)

type Permission struct {
	Public  string `json:"public,omitempty"`
	Friend  string `json:"friend,omitempty"`
	Private string `json:"private,omitempty"`
}
