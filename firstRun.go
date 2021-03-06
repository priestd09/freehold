// Copyright 2014 Tim Shannon. All rights reserved.
// Use of this source code is governed by the MIT license
// that can be found in the LICENSE file.

package main

import (
	"os"
	"path/filepath"

	"bitbucket.org/tshannon/freehold/app"
	"bitbucket.org/tshannon/freehold/fail"
	"bitbucket.org/tshannon/freehold/permission"
	"bitbucket.org/tshannon/freehold/resource"
	"bitbucket.org/tshannon/freehold/user"
)

var firstRun bool

// makeFirstAdmin is used to make the first admin user, then set the default starting permissions
// on all of the core resources
func makeFirstAdmin(username, password string) error {
	if !firstRun {
		return fail.New("The freehold "+user.DS+" datastore has already been initiated, "+
			"and the First Admin has already been created. Another cannot be created using this method.", nil)
	}

	//setup folders
	err := os.MkdirAll(resource.AppDir, 0777)
	if err != nil {
		return err
	}
	err = os.MkdirAll(resource.AvailableAppDir, 0777)
	if err != nil {
		return err
	}
	err = os.MkdirAll(resource.FileDir, 0777)
	if err != nil {
		return err
	}

	err = os.MkdirAll(resource.DatastoreDir, 0777)
	if err != nil {
		return err
	}

	admin := &user.User{
		Password: password,
		Admin:    true,
	}
	err = user.New(username, admin)
	if err != nil {
		return err
	}

	err = setupCore(username)
	if err != nil {
		return err
	}

	err = setupHome(username)
	if err != nil {
		return err
	}

	firstRun = false
	return nil
}

func setupHome(owner string) error {
	_, err := app.Install("home.zip", owner)
	return err
}

// setupCore sets the initial starting permissions for all necessary core resources
func setupCore(owner string) error {
	//core files
	return recurseSetPermissionOnFolder(filepath.ToSlash("application/core/file/"), &permission.Permission{
		Owner:   owner,
		Public:  permission.Read,
		Friend:  permission.Read,
		Private: permission.Read + permission.Write,
	})
}

func resetCorePermissions() error {
	p, err := permission.Get(&app.Resource{filepath.ToSlash("application/core/file/public.html")})
	if err != nil {
		return err
	}
	return setupCore(p.Owner)
}

func recurseSetPermissionOnFolder(filePath string, prm *permission.Permission) error {
	dir, err := os.Open(filePath)
	defer dir.Close()
	if err != nil {
		return err
	}

	files, err := dir.Readdir(0)
	if err != nil {
		return err
	}

	//set folder permissions
	err = permission.Set(&app.Resource{filePath}, prm)
	if err != nil {
		return err
	}

	for i := range files {
		child := filepath.Join(filePath, files[i].Name())
		if files[i].IsDir() {
			err = recurseSetPermissionOnFolder(child, prm)
			if err != nil {
				return err
			}
			continue
		}

		err = permission.Set(&app.Resource{child}, prm)
		if err != nil {
			return err
		}
	}
	return nil
}

const firstRunAdminPage = `
<!DOCTYPE html>
<html>
<head>
	<title>freehold</title>
</head>
<body>
	<h2>Welcome to your new freehold instance!</h2>
	<p>You need to setup the first administrative user before you can start using your freehold instance.</p>

	<h3>Choose a username and password</h3>
	{{if . }}
	<label style="color:red;">An error occurred when processing your login: <b>{{.}}</b></label>
	{{end}}
	<form role="form" id="login" name="login" action="/" method="post">
		<label for="username">Username</label><br>
		<input type="username" id="username" name="username" placeholder="Enter Username">
		<br><br>
		<label for="password">Password</label><br>
		<input type="password" id="password" name="password" placeholder="Enter Password"><br>
		<button type="submit">Submit</button>
	</form>
</body>
</html>
`
