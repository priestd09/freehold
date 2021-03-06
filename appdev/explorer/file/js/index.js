// Copyright 2014 Tim Shannon. All rights reserved.
// Use of this source code is governed by the MIT license
// that can be found in the LICENSE file.

$(document).ready(function() {
    var urlParm = fh.util.urlParm("url");
    var defaultIcons = buildDefaultIcons();
    var defaultApps = buildDefaultApps();
    var settings = new Settings();
    settings.stars = new Stars();
    settings.fileType = new FileTypeSettings();

    var rNav = new Ractive({
        el: "#nb",
        template: "#tNav",
    });

    var nav = rNav.findComponent("navbar");

    var rMain = new Ractive({
        el: "#pageContainer",
        template: "#tMain",
        data: {
            files: {},
            datastores: {},
            stars: {},
            user: fh.auth.user,
            icons: buildIconList(),
            selection: [],
            domain: location.origin,
        },
    });

    getApps();
    getUsers();


    fh.settings.get("RequirePasswordToGenerateToken")
        .done(function(result) {
            rMain.set("requirePassword", result.data.value);
        })
        .fail(function(result) {
            error(result);
        });


    settings.load(function() {
        rMain.set("sorting", settings.get("sorting", {
            by: "name",
            asc: true
        }));
        rMain.set("newWindow", settings.get("newWindow", true));
        rMain.set("folderSort", settings.get("folderSort", true));
        rMain.set("hideSidebar", settings.get("hideSidebar", false));
        rMain.set("listView", settings.get("listView", false));
        rMain.set("tokenExpireDays", settings.get("tokenExpireDays", 15));

        setRoot();
        if (urlParm) {
            urlParm = decodeURI(urlParm);
            openUrl(urlParm);
        } else {
            selectUserFolder();
        }
    });

    window.onpopstate = function(event) {
        if (event.state) {
            selectFolder(event.state, true);
        }
    };


    //events
    rMain.on({
        "fileTreeSelect": function(event) {
            selectFolder(keypathFromTree(event.keypath, false));
        },
        "dsTreeSelect": function(event) {
            selectFolder(keypathFromTree(event.keypath, true));
        },
        "explorerSelect": function(event) {
            if (rMain.get("currentKeypath") === "stars") {
                openUrl(event.context.url);
                return;
            }
            selectFolder(event.context.treepath);
        },
        "crumbSelect": function(event) {
            selectFolder(event.context.keypath);
        },
        "dsOpen": function(event) {
            var keypath = keypathFromTree(event.keypath, true);
            rMain.set(keypath, setFileType(rMain.get(keypath)));
            updateFolder(event.context.url, keypath);
        },
        "tree.open": function(event) {
            var keypath = keypathFromTree(event.keypath, event.component.get("dsTree"));
            updateFolder(event.context.url, keypath);
            if (event.keypath !== "root") {
                rMain.set(keypath, setFileType(rMain.get(keypath)));
            }
        },
        "star": function(event) {
            var url = event.context.url;
            if (settings.stars.isStar(url)) {
                settings.stars.remove(url);
                rMain.set(event.keypath + ".starred", false);
            } else {
                settings.stars.add(url);
                rMain.set(event.keypath + ".starred", true);
            }

        },
        "viewStarred": function(event) {
            selectFolder("stars");
        },
        "newFolder": function(event) {
            rMain.set("newFolderName", null);
            rMain.set("newFolderError", null);
            $("#newFolder").modal();

            $("#newFolder").on("shown.bs.modal", function() {
                $("#folderName").focus();
            });
        },
        "newFolderSave": function(event) {
            event.original.preventDefault();
            if (!event.context.newFolderName) {
                rMain.set("newFolderError", "You must specify a folder name.");
                return;
            }
            var newUrl = fh.util.urlJoin(event.context.currentFolder.url, event.context.newFolderName);

            fh.file.newFolder(newUrl)
                .done(function() {
                    refresh();
                    $("#newFolder").modal("hide");
                })
                .fail(function(result) {
                    result = result.responseJSON;
                    rMain.set("newFolderError", result.message);
                });
        },
        "removeStar": function(event) {
            var stars = rMain.get("currentFolder.files");
            settings.stars.remove(event.context.url);
            stars.splice(event.index.i, 1);
            resetSelection();
        },
        "selectApp": function(event) {
            if (event.index) {
                setRoot(event.index.i, true);
            } else {
                setRoot();
                selectUserFolder();
            }
        },
        "changeView": function(event) {
            if (rMain.get("listView")) {
                rMain.set("listView", false);
                settings.put("listView", false);
            } else {
                rMain.set("listView", true);
                settings.put("listView", true);
            }
            refresh();
        },
        "renameFolder": function(event) {
            rMain.set("folderRename", event.context.name);
            rMain.set("renameFolderError", null);
            $("#renameFolder").modal();

            $("#renameFolder").on("shown.bs.modal", function() {
                $("#folderRename").focus();

            });
        },
        "renameFolderSave": function(event) {
            event.original.preventDefault();
            if (!event.context.folderRename) {
                rMain.set("renameFolderError", "You must specify a folder name.");
                return;
            }
            var newUrl = fh.util.urlJoin(rMain.get(parentKeypath(event.context.currentKeypath) + ".url"), event.context.folderRename);
            var oldUrl = event.context.currentFolder.url;

            moveFile(oldUrl, newUrl)
                .done(function() {
                    $("#renameFolder").modal("hide");
                    openUrl(newUrl);
                })
                .fail(function(result) {
                    result = result.responseJSON;
                    rMain.set("renameFolderError", result.message);
                });
        },
        "renameFile": function(event) {
            event.original.preventDefault();

            if (!event.context.name) {
                rMain.set("currentFile.renameError", "You must specify a name.");
                return;
            }
            var newUrl = event.context.url.split("/");
            newUrl.pop();
            newUrl = fh.util.urlJoin(newUrl.join("/"), event.context.name);
            var oldUrl = event.context.url;

            if (newUrl == oldUrl) {
                rMain.set("currentFile.rename", false);
                return;
            }

            moveFile(oldUrl, newUrl)
                .done(function() {
                    rMain.set("currentFile.rename", false);

                    getFile(newUrl, function(file) {
                        rMain.set("currentFile", setFileType(file));
                    }, function(result) {
                        rMain.set("currentFile.renameError", result.message);
                        return;
                    });
                    if (event.context.isDir) {
                        openUrl(newUrl);
                    } else {
                        refresh();
                    }

                })
                .fail(function(result) {
                    result = result.responseJSON;
                    rMain.set("currentFile.renameError", result.message);
                });

        },
        "deleteFolder": function(event) {
            fh.file.delete(event.context.url);
            selectFolder(parentKeypath(rMain.get("currentKeypath")));
            settings.stars.remove(event.context.url);
        },
        "sortBy": function(event, by) {
            if (rMain.get("sorting.by") === by) {
                rMain.toggle("sorting.asc");
            } else {
                rMain.set("sorting.by", by);
            }

            sortCurrent();
            settings.put("sorting", rMain.get("sorting"));
        },
        "openSettings": function(event) {
            $("#settings").modal();
        },
        "properties": function(event, url) {
            $("#properties").modal();
            $('#propTabs a:first').tab('show');
            rMain.set("currentFile", null);

            getFile(url, function(file) {
                file.starred = settings.stars.isStar(url);
                file.url = trimSlash(url);
                if (file.permissions.owner) {
                    file.showOwner = true;
                } else {
                    file.showOwner = false;
                }
                rMain.set("currentFile", file);
            }, function(result) {
                if (result.message === "Resource not found") {
                    result.data.propError = "You do not have permissions to view the properties of this file.";
                }
                rMain.set("currentFile", result.data);
            });

            resetSelection();
        },
        "deleteFromProperties": function(event) {
            fh.file.delete(event.context.url)
                .done(function() {

                    var keypath = rMain.get("currentKeypath");
                    if (event.context.isDir) {
                        keypath = parentKeypath(keypath);
                    }
                    selectFolder(keypath);
                    settings.stars.remove(event.context.url);

                    $("#properties").modal("hide");
                })
                .fail(function(result) {
                    result = result.responseJSON;
                    rMain.set("currentFile.propError", result.message);
                });
        },
        "defaultFileBehavior": function(event) {
            var file = rMain.get("currentFile");
            settings.fileType.default(settings.fileType.ext(file.name));
            rMain.set("currentFile", setFileType(file));
        },
        "fileinput.setFiles": function(event) {
            var files = event.context.files;

            for (var i = 0; i < files.length; i++) {
                uploadFile(files[i], rMain.get("currentFolder.url"));
            }
        },
        "replaceUpload": function(event) {
            var file = event.context;
            file.error = false;
            file.exists = false;
            uploadFile(file, event.uploadPath, true);
        },
        "cancelUpload": function(event) {
            if (!event.context.error && event.context.xhr) {
                event.context.xhr.abort();
            } else {
                removeUpload(event.context.id);
            }
        },
        "dropzone.drop": function(files) {
            //TODO: Handle datastore files
            for (var i = 0; i < files.length; i++) {
                uploadFile(files[i], rMain.get("currentFolder.url"));
            }
        },
        "droppable.drop": function(source, dest) {
            rMain.set("fileAlerts", []);
            if (source instanceof Array) {
                for (var i = 0; i < source.length; i++) {
                    moveExplorerFile(source[i], dest);
                }
                return;
            }
            moveExplorerFile(source, dest);
        },
        "selectable.selected": function(node) {
            var index = node.getAttribute("data-select");
            var files = rMain.get("currentFolder.files");
            if (files[index].inSelection) {
                return;
            }
            files[index].inSelection = true;
            rMain.push("selection", files[index]);
            rMain.set("currentFolder.files", files);
        },
        "selectable.unselected": function(node) {
            var index = node.getAttribute("data-select");
            var files = rMain.get("currentFolder.files");
            files[index].inSelection = false;
            rMain.set("currentFolder.files", files);
            var selected = rMain.get("selection");

            for (var i = 0; i < selected.length; i++) {
                if (selected[i].url === files[index].url) {
                    rMain.splice("selection", i, 1);
                    return;
                }
            }
        },
        "deleteSelectStars": function(event) {
            var selected = rMain.get("selection");

            for (var i = 0; i < selected.length; i++) {
                settings.stars.remove(selected[i].url);
            }
            refresh();
        },
        "deleteSelect": function(event) {
            var selected = rMain.get("selection");
            var requests = [];
            if (selected.length === 0) {
                return;
            }

            for (var i = 0; i < selected.length; i++) {
                if (selected[i].isFilePath) {
                    requests.push(fh.file.delete(selected[i].url));
                } else {
                    var ds = new fh.Datastore(selected[i].url);
                    requests.push(ds.drop());
                }
            }

            $.when(requests)
                .done(function() {
                    refresh();
                })
                .fail(function(result) {
                    error(result);
                });
        },
        "permissions.permissionsChange": function(event) {
            fh.properties.set(rMain.get("currentFile.url"), {
                    permissions: event,
                })
                .done(function() {
                    refresh();
                })
                .fail(function(result) {
                    error(result);
                });

        },
        "dismissFileAlert": function(event) {
            rMain.splice(event.keypath.split(".")[0], event.index.i, 1);
        },
        "fileAlertReplace": function(event) {
            rMain.splice(event.keypath.split(".")[0], event.index.i, 1);
            var source = event.context.source;
            var dest = event.context.dest;
            fh.file.delete(dest.url)
                .done(function() {
                    moveExplorerFile(source, dest.destFolder);
                })
                .fail(function(result) {
                    error(result);
                });

        },
        "fileAlertRename": function(event) {
            rMain.splice(event.keypath.split(".")[0], event.index.i, 1);
            var source = event.context.source;
            var dest = event.context.dest;

            moveFile(dest.url, fh.util.urlJoin(dest.destFolder.url, dest.rename))
                .done(function() {
                    moveExplorerFile(source, dest.destFolder);
                })
                .fail(function(result) {
                    error(result);
                });

        },
        "loadShareLinks": function(event) {
            rMain.set("shareLinks.errors", {});
            rMain.set("shareLinks.password", null);
            rMain.set("shareLinks.newUrl", null);

            getLinks();
        },
        "generateShareLink": function(event) {
            event.original.preventDefault();
            var username, password;
            if (rMain.get("requirePassword")) {
                if (!event.context.password) {
                    rMain.set("shareLinks.errors.password", "A password is required to generate a new token");
                    return;
                }
                username = fh.auth.user;
                password = event.context.password;
            }
            var file = rMain.get("currentFile");

            var expires = new Date(Date.now());
            expires.setDate(expires.getDate() + rMain.get("tokenExpireDays"));

            fh.token.new({
                    name: "Explorer Share Link - " + file.name,
                    expires: expires.toJSON(),
                    resource: file.url,
                    permission: "r",
                }, username, password)
                .done(function(result) {
                    rMain.set("shareLinks.errors", {});
                    rMain.set("shareLinks.username", null);
                    rMain.set("shareLinks.password", null);

                    var url = fh.util.urlJoin(rMain.get("domain"), "/v1/auth/token/");
                    url += "?user=" + fh.auth.user + "&token=" + result.data.token;
                    rMain.set("shareLinks.newUrl", url);
                    //select text for user
                    var node = rMain.find("#shareLinkUrl");
                    node.select();

                    result.data.expiresDate = new Date(result.data.expires).toLocaleString();
                    result.data.createdDate = new Date(result.data.created).toLocaleString();
                    rMain.push("shareLinks.links", result.data);

                })
                .fail(function(result) {
                    rMain.set("shareLinks.errors.username", result.responseJSON.message);
                });
        },
        "removeLink": function(event) {
            fh.token.delete(event.context.id)
                .done(function() {
                    rMain.splice("shareLinks.links", event.index.i, 1);
                })
                .fail(function(result) {
                    error(result);
                });
        },
        "toggleSearch": function(event) {
            rMain.toggle("searchMode");
            var searchMode = rMain.get("searchMode");
            rMain.set("searchValue", "");
            if (searchMode) {
                $("#searchInput").focus();
            } else {
                //stop search
                rMain.set("searching", false);
                refresh();
            }
        },
        "search": function(event) {
            event.original.preventDefault();

            resetSelection();
            var regex;
            try {
                regex = new RegExp(rMain.get("searchValue"), "i");
            } catch (e) {
                nav.fire("addAlert", "warning", "Invalid Search Value: ", e.message);
                return;
            }
            rMain.set("currentFolder.files", []);

            var files = rMain.get("currentFolder.files");

            rMain.set("searching", true);
            searchFolder(files, regex, rMain.get("currentFolder.url"));

        },
    });

    rMain.observe({
        "newWindow": function(newValue, oldValue, keypath) {
            if (newValue !== undefined) {
                settings.put("newWindow", newValue);
                refresh();
            }
        },
        "folderSort": function(newValue, oldValue, keypath) {
            if (newValue !== undefined) {
                settings.put("folderSort", newValue);
                sortCurrent();
            }
        },
        "hideSidebar": function(newValue, oldValue, keypath) {
            if (newValue !== undefined) {
                settings.put("hideSidebar", newValue);
            }
        },
        "tokenExpireDays": function(newValue, oldValue, keypath) {
            if (newValue !== undefined) {
                settings.put("tokenExpireDays", newValue);
            }
        },
        "currentFile.behavior": function(newValue, oldValue, keypath) {
            if (newValue && oldValue) {
                settings.fileType.set(rMain.get("currentFile"));
                refresh();
            }
        },
        "currentFile.explorerIcon": function(newValue, oldValue, keypath) {
            if (newValue && oldValue) {
                var file = rMain.get("currentFile");

                settings.fileType.set(file);
                refresh();
            }
        },
        "currentFile.iconColor": function(newValue, oldValue, keypath) {
            if (newValue && oldValue) {
                settings.fileType.set(rMain.get("currentFile"));
                refresh();
            }
        },
    });

    //functions
    function selectFolder(keypath, skipHistory) {
        resetSelection();
        stopSearch();
        var folder = rMain.get(keypath);

        if (!folder || !folder.isDir) {
            return;
        }

        document.title = folder.name + " - Explorer - freehold";
        if (!skipHistory) {
            history.pushState(keypath, "");
        }

        var prevKeypath = rMain.get("currentKeypath");

        rMain.set("currentKeypath", keypath);
        rMain.set("currentDSKeypath", keypath.replace('datastores', 'root'));
        rMain.set("currentFileKeypath", keypath.replace('files', 'root'));
        rMain.set("currentStarKeypath", keypath.replace('stars', 'root'));
        if (keypath === "stars") {
            updateStarFolder();
            return;
        }

        updateFolder(folder.url, keypath, function() {

            folder = rMain.get(keypath);
            openParent(keypath);
            buildBreadcrumbs(keypath);

            folder.files = [];

            for (var i = 0; i < folder.children.length; i++) {
                folder.files.push(folder.children[i]);
            }

            rMain.set("currentFolder", folder);
            sortCurrent();

            rMain.set("currentFolder.starred", settings.stars.isStar(folder.url));
        }, function() {
            //failed to update
            selectFolder(prevKeypath);
        });

    }

    function updateFolder(url, keypath, postUpdate, postFail) {
        fh.properties.get(url)
            .done(function(result) {
                mergeFolder(result.data, keypath + ".children");
                if (postUpdate) {
                    postUpdate();
                }
            })
            .fail(function(result) {
                if (postFail) {
                    result = result.responseJSON;
                    postFail(result);
                }
            });
    }

    function setRoot(app, selectRootFolder) {
        rMain.set("app", app);
        rMain.set("files", {
            url: fh.util.urlJoin("/", app, "/v1/file/"),
            name: "files",
            canSelect: true,
            selected: true,
            iconClass: "fa fa-folder-open",
            droppable: true,
            isDir: true,
            isFilePath: true,
            treepath: "files",
            children: [],
        });
        rMain.set("datastores", {
            url: fh.util.urlJoin("/", app, "/v1/datastore/"),
            name: "datastores",
            canSelect: true,
            isFilePath: false,
            isDir: true,
            iconClass: "fa fa-database",
            children: [],
        });
        rMain.set("stars", {
            name: "Starred",
            isDir: true,
            canSelect: true,
            isFilePath: false,
            iconClass: "glyphicon glyphicon-star",
        });
        if (selectRootFolder) {
            selectFolder("files");
        }
    }

    function keypathFromTree(keypath, ds) {
        if (ds) {
            return keypath.replace("root", "datastores");
        }
        return keypath.replace("root", "files");
    }

    function parentKeypath(keypath) {
        var last = keypath.lastIndexOf(".children");
        if (last === -1) {
            return -1;
        }
        return keypath.slice(0, last);

    }

    function openParent(keypath) {
        keypath = parentKeypath(keypath);

        if (!rMain.get(keypath + ".open")) {
            rMain.set(keypath + ".open", true);
            rMain.set(keypath + ".iconClass", "fa fa-folder-open");
        }
    }

    function openUrl(url) {
        //FIXME: Issue with current Ractive, teardown on non-initiated decorators
        // need to eventually switch to latest Ractive to resolve it
        if (url.indexOf(location.origin) === 0) {
            url = url.slice(location.origin.length);
        }
        var s = fh.util.splitRootAndPath(url);

        if (fh.util.versions().indexOf(s[0]) === -1) {
            //is app
            setRoot(s[0]);
        } else {
            setRoot();
        }
        rMain.set("loading", true);

        updateFilesTo(isFile(url) ? "files" : "datastores", url);
    }

    function isFile(url) {
        if (!url) {
            return false;
        }
        var s = fh.util.splitRootAndPath(url);

        if (fh.util.versions().indexOf(s[0]) !== -1) {
            //is version
            return fh.util.splitRootAndPath(s[1])[0] == "file";
        } else {
            //isapp
            return isFile(s[1]);
        }
    }


    //updateFilesTo recursively updates the filetree to the destination url
    // used for url parms and bookmarks
    function updateFilesTo(fromKeypath, to) {
        var newUrl = rMain.get(fromKeypath + ".url");

        fh.properties.get(newUrl)
            .done(function(result) {
                var newKeypath = fromKeypath + ".children";
                mergeFolder(result.data, newKeypath);
                openParent(fromKeypath);
                if (newUrl.indexOf(to) !== -1) {
                    selectFolder(fromKeypath);
                    rMain.set("loading", false);
                    return;
                }


                var nextUrl = fh.util.urlJoin(newUrl, to.slice(newUrl.length).split("/")[0], "/");

                for (var i = 0; i < result.data.length; i++) {
                    if (nextUrl == result.data[i].url) {
                        updateFilesTo(newKeypath + "." + i, to);
                        return;
                    }
                }
                //no matching url found
                rMain.set("loading", false);
                selectFolder(fromKeypath);

            })
            .fail(function(result) {
                error("Invalid or inaccessible URL: " + result.responseJSON.message);
                //select last valid keypath and stop loading
                rMain.set("loading", false);
                selectFolder(fromKeypath);
            });
    }

    function mergeFolder(newFiles, keypath) {
        var current = rMain.get(keypath);
        sort(newFiles, {
            by: "name",
            asc: true
        });


        //merge the current data with the new data so that
        // tree attributes like open and selected aren't lost
        for (var i = 0; i < newFiles.length; i++) {
            if (current) {
                var index = -1;
                for (var j = 0; j < current.length; j++) {
                    if (newFiles[i].url === current[j].url) {
                        index = j;
                        break;
                    }
                }
                if (index >= 0 && current[index].isDir) {
                    mergeAttributes(current[index], newFiles[i]);
                }
            }
            newFiles[i] = setFileType(newFiles[i]);
            newFiles[i].treepath = keypath + "." + i;
        }

        rMain.set(keypath, newFiles);
    }

    function mergeAttributes(current, newval) {
        for (var a in current) {
            if (!newval.hasOwnProperty(a)) {
                newval[a] = current[a];
            }
            if (a === "children") {
                //don't overwrite existing children
                newval[a] = current[a];
            }
        }
    }


    function setFileType(file) {
        if (file.modified) {
            file.modifiedDate = new Date(file.modified).toLocaleString();
            file.canRead = true;
        } else {
            file.canRead = false;
        }


        file.isFilePath = isFile(file.url);

        file.selectable = isSelectable(file);
        file.exDraggable = isDraggable(file);
        file.droppable = isDroppable(file);

        if (file.isDir) {
            file.explorerIcon = "folder";

            if (!file.canRead) {
                file.open = false;
            } else {
                file.canSelect = true;
            }

            if (file.open) {
                file.iconClass = "fa fa-folder-open";
            } else {
                file.iconClass = "fa fa-folder";
            }
            if (!file.hasOwnProperty("children")) {
                file.children = [];
            }

        } else {
            var ext = settings.fileType.ext(file.name);

            file.explorerIcon = settings.fileType.explorerIcon(ext);
            file.behavior = settings.fileType.behavior(ext);
            file.iconColor = settings.fileType.iconColor(ext);
            if (file.behavior.app) {
                file.explorerUrl = fh.util.urlJoin("/", file.behavior.appID, "?file=", file.url);
            } else {
                file.explorerUrl = file.url;
            }

            file.hide = true; //hide from treeview
            if (file.size) {
                file.humanSize = filesize(file.size); //thanks Jason Mulligan (https://github.com/avoidwork/filesize.js)
            }
        }


        return file;
    }


    function isSelectable(file) {
        if (!file.canRead) {
            return false;
        }

        if (file.isDir) {
            if (file.isFilePath) {
                return true;
            }
            //datastore dir
            return false;
        }

        return true;
    }

    function isDroppable(file) {
        if (!file.canRead) {
            return false;
        }
        if (!file.isDir) {
            return false;
        }
        if (!file.isFilePath) {
            return false;
        }

		if(file.permissions) {
        var prm = file.permissions;
        if (prm.owner === fh.auth.user && prm.private) {
            if (prm.private.indexOf("w") == -1) {
                return false;
            }
        }

        if (prm.friend && prm.friend.indexOf("w") == -1) {
            return false;
        }
	}

        return true;
    }

    function isDraggable(file) {
        if (!file.canRead) {
            return false;
        }

        if (!file.isFilePath) {
            return false;
        }
        return true;
    }

    function buildBreadcrumbs(keypath) {
        var crumbs = [];
        while (keypath.lastIndexOf(".children") > 0) {
            keypath = keypath.slice(0, keypath.lastIndexOf(".children"));
            crumbs.push({
                keypath: keypath,
                file: rMain.get(keypath)
            });
        }
        crumbs.reverse();
        rMain.set("breadcrumbs", crumbs);
    }

    function sortCurrent() {
        var sorting = rMain.get("sorting");
        var files = rMain.get("currentFolder.files");
        sort(files, sorting);

        rMain.set("currentFolder.files", files);
    }

    function sort(files, sorting) {
        if (!files) {
            return;
        }

        files.sort(function(a, b) {
            var sa, sb;

            if (sorting.by === "owner") {
                if (a.permissions) {
                    sa = a.permissions.owner;
                }
                if (b.permissions) {
                    sb = b.permissions.owner;
                }
            } else {
                sa = a[sorting.by];
                sb = b[sorting.by];
            }

            if (typeof sa === "string") {
                sa = sa.toLowerCase();
            }

            if (typeof sb === "string") {
                sb = sb.toLowerCase();
            }

            if (!sorting.asc) {
                var tmp = sa;
                sa = sb;
                sb = tmp;
            }

            if (settings.get("folderSort", true)) {
                if (a.isDir && !b.isDir) {
                    return -1;
                }

                if (b.isDir && !a.isDir) {
                    return 1;
                }
            }

            if (sorting.by === "modified") {
                if (sa) {
                    sa = Date.parse(sa);
                }
                if (sb) {
                    sb = Date.parse(sb);
                }
            }


            if (sa !== undefined && sb !== undefined) {
                if (sa > sb) {
                    return 1;
                }
                if (sa < sb) {
                    return -1;
                }
                return 0;
            }
            if (sa !== undefined) {
                return 1;
            }

            if (sb !== undefined) {
                return -1;
            }
            return 0;
        });

    }

    function updateStarFolder() {
        var stars = settings.get("starred", {});
        var list = Object.getOwnPropertyNames(stars);
        var folder = rMain.set("currentFolder", {
            "name": "stars",
            "files": [],
        });

        var files = rMain.get("currentFolder.files");

        var fileAdd = function(file) {
            file.isFilePath = false;
            file.exDraggable = false;
            file.droppable = false;
            file.selectable = true;
            files.push(file);
            sortCurrent();
        };

        for (var i = 0; i < list.length; i++) {
            if (list[i] === "/v1/file/") {
                fileAdd({
                    name: "files",
                    explorerIcon: "fa fa-folder-open",
                    url: list[i],
                    isDir: true,
                });
                continue;
            }

            if (list[i] === "/v1/datastore/") {
                fileAdd({
                    name: "datastores",
                    explorerIcon: "fa fa-database",
                    url: list[i],
                    isDir: true,
                });
                continue;
            }

            getFile(list[i], fileAdd);
        }
    }

    function trimSlash(url) {
        if (url.lastIndexOf("/") === url.length - 1) {
            return url.slice(0, url.length - 1);
        }
        return url;
    }

    function getFile(url, postGet, failGet) {
        var fileurl = trimSlash(url);

        fh.properties.get(fileurl)
            .then(function(result) {
                var file = result.data;

                if (!file.hasOwnProperty("url")) {
                    file.url = url;
                }
                if (!file.hasOwnProperty("name")) {
                    file.name = fileurl.split("/").pop();
                }
                file = setFileType(file);
                if (postGet) {
                    postGet(file);
                }
            })
            .fail(function(result) {
                result = result.responseJSON;
                if (failGet) {
                    result.data = {
                        name: fileurl.split("/").pop(),
                        url: url,
                        isDir: false,
                        size: 0,
                        permissions: {},
                    };
                    failGet(result);
                }
            });
    }

    function refresh() {
        var keypath = rMain.get("currentKeypath");
        if (keypath) {
            selectFolder(keypath, true);
        }
        resetSelection();
        stopSearch();
    }

    function moveExplorerFile(source, dest) {
        if (source.url === dest.url) {
            return;
        }

        var newUrl = fh.util.urlJoin(dest.url, trimSlash(source.url).split("/").pop());
        if (trimSlash(source.url) == newUrl) {
            return;
        }


        //check if dest file already exists
        getFile(newUrl, function(file) {
            //file exists
            //build possible rename
            var split = file.name.split(".");
            var ext = split.pop();
            split.push("copy");
            split.push(ext);
            file.rename = split.join(".");
            file.destFolder = dest; //store folder for later
            rMain.push("fileAlerts", {
                source: source,
                dest: file,
            });

        }, function() {
            moveFile(source.url, newUrl)
                .done(function() {
                    if (source.treepath) {
                        //if source is in tree, update tree
                        var sourceParent = rMain.get(parentKeypath(source.treepath));
                        updateFolder(sourceParent.url, sourceParent.treepath);
                    }
                    if (dest.treepath) {
                        //if dest is in tree, update tree
                        updateFolder(dest.url, dest.treepath);
                    }
                    refresh();
                })
                .fail(function(result) {
                    error(result);
                });

        });

    }

    function moveFile(from, to) {
        return fh.file.move(from, to)
            .done(function() {
                if (settings.stars.isStar(from)) {
                    settings.stars.remove(from);
                    settings.stars.add(to);
                }
            });
    }

    function error(err) {
        if (typeof err === "string") {
            nav.fire("addAlert", "danger", "", err);
            return;
        } else {
            err = err.responseJSON;
            if (err.hasOwnProperty("failures")) {
                for (var i = 0; i < err.failures.length; i++) {
                    nav.fire("addAlert", "danger", "", err.failures[i].message);
                }
            } else {
                nav.fire("addAlert", "danger", "", err.message);
            }
        }
    }

    function getApps() {
        fh.application.installed()
            .done(function(result) {
                rMain.set("apps", result.data);
            })
            .fail(function(result) {
                error(result);
            });
    }

    function getUsers() {
        fh.user.all()
            .done(function(result) {
                //add empty row for empty user
                rMain.set("users", result.data);
            })
            .fail(function(result) {
                error(result);
            });
    }


    function selectUserFolder() {
        //open user folder if one exists
        var userFolder = fh.util.urlJoin("/v1/file/", fh.auth.user);
        fh.properties.get(userFolder)
            .fail(function() {
                selectFolder("files");
            })
            .done(function() {
                updateFilesTo("files", userFolder);
            });
    }

    function uploadFile(file, uploadPath, replace) {
        var uploadFunc;
        if (!uploadPath) {
            uploadPath = file.uploadPath;
        }

        var isDS = !isFile(uploadPath);

        if (replace && !isDS) {
            //Delete file and upload to preserve original modified date
            fh.file.delete(fh.util.urlJoin(uploadPath, file.name))
                .done(function() {
                    fileRemoveInCurrent(file);
                    uploadFile(file, uploadPath);
                })
                .fail(function(result) {
                    error(result);
                });
            return;
        } else {
            if (!isDS) {
                uploadFunc = fh.file.upload;
            } else {
                uploadFunc = fh.datastore.upload;
            }
        }
        file = setFileType(file);

        file.uploadPath = uploadPath;

        var id = file.name.split(".").join("_"); //ractive doesn't like object ids with "." in them
        file.id = id;

        rMain.set("uploads." + id, file);

        if (!replace && fileExistsInCurrent(file)) {
            if (isDS) {
                rMain.set("uploads." + id + ".error", "A datastore with this name already exists!");
            } else {
                rMain.set("uploads." + id + ".exists", true);
                rMain.set("uploads." + id + ".error", "File already exists!");
            }
            return;
        }

        file.xhr = uploadFunc(uploadPath, file, function(evt) {
                if (evt.lengthComputable) {
                    rMain.set("uploads." + id + ".progress", ((evt.loaded / evt.total) * 100).toFixed(1));
                }
            })
            .done(function(result) {
                removeUpload(id);
                refresh();
            })
            .fail(function(result) {
                if (result.status === 0) {
                    rMain.set("uploads." + id + ".error", "Upload Canceled");
                } else {
                    var errMsg;
                    if (result.responseJSON.failures) {
                        errMsg = result.responseJSON.failures[0].message;
                    } else {
                        errMsg = result.responseJSON.message;
                    }
                    rMain.set("uploads." + id + ".error", errMsg);
                }
            });

    }

    function fileExistsInCurrent(file) {
        var files = rMain.get("currentFolder.children");

        for (var i = 0; i < files.length; i++) {
            if (files[i].name === file.name) {
                return true;
            }
        }
        return false;
    }

    function fileRemoveInCurrent(file) {
        var files = rMain.get("currentFolder.children");

        for (var i = 0; i < files.length; i++) {
            if (files[i].name === file.name) {
                rMain.splice("currentFolder.children", i, 1);
            }
        }

    }

    function removeUpload(id) {
        var uploads = rMain.get("uploads");
        delete uploads[id];
        if (Object.getOwnPropertyNames(uploads) < 1) {
            rMain.set("uploads", null);
        } else {
            rMain.set("uploads", uploads);
        }

    }

    function resetSelection() {
        var comp = rMain.findComponent("selectable");
        comp.fire("reset");
        rMain.set("selection", []);

    }

    function getLinks() {
        var file = rMain.get("currentFile");
        rMain.set("shareLinks.links", []);

        fh.token.get()
            .done(function(result) {
                var tokens = result.data;
                for (var i = 0; i < tokens.length; i++) {
                    if (tokens[i].resource == file.url) {
                        tokens[i].expiresDate = new Date(tokens[i].expires).toLocaleString();
                        tokens[i].createdDate = new Date(tokens[i].created).toLocaleString();
                        rMain.push("shareLinks.links", tokens[i]);
                    }
                }
            })
            .fail(function(result) {
                error(result);
            });
    }


    //searchFolder finds all files that match the regex and
    // adds them to the passed in array
    function searchFolder(matchedFiles, regex, folderUrl) {
        if (!rMain.get("searching")) {
            return;
        }
        searchFolderStart(folderUrl);

        fh.properties.get(folderUrl)
            .done(function(result) {
                for (var i = 0; i < result.data.length; i++) {
                    var file = result.data[i];
                    if (file.isDir) {
                        searchFolder(matchedFiles, regex, file.url);
                    } else {
                        if (regex.exec(file.name)) {
                            matchedFiles.push(setFileType(file));
                        }
                    }
                }
                searchFolderFinish(folderUrl);
            })
            .fail(function() {
                searchFolderFinish(folderUrl);
            });
    }

    function searchFolderStart(folder) {
        var sFolders = rMain.get("searchFolders") || {};

        sFolders[folder] = true;

        rMain.set("searchFolders", sFolders);
    }

    function searchFolderFinish(folder) {
        var sFolders = rMain.get("searchFolders");
        delete sFolders[folder];

        if (Object.getOwnPropertyNames(sFolders).length === 0) {
            rMain.set("searching", false);
        }

        rMain.set("searchFolders", sFolders);

    }

    function stopSearch() {
        rMain.set("searchMode", false);
        rMain.set("searching", false);
    }

    //Settings

    function Stars() {
        return {
            add: function(url) {
                var stars = settings.get("starred", {});
                stars[trimSlash(url)] = {};
                settings.put("starred", stars);
            },
            remove: function(url) {
                var stars = settings.get("starred", {});
                delete stars[trimSlash(url)];
                settings.put("starred", stars);
            },
            isStar: function(url) {
                var stars = settings.get("starred", {});
                if (stars.hasOwnProperty(trimSlash(url))) {
                    return true;
                }
                return false;
            },
        };
    }

    function FileTypeSettings() {
        function get(filetype) {
            var file = settings.get("files", {})[filetype];
            if (!file) {
                file = def(filetype);
            }
            return file;

        }

        function def(filetype) {
            return {
                behavior: {
                    download: false,
                    appID: defaultApps[filetype],
                    app: (defaultApps[filetype] !== undefined),
                    browser: (!defaultApps[filetype]),
                },
                explorerIcon: defaultIcons[filetype.toLowerCase()] || "file-o",
                iconColor: "#333",
            };
        }

        function equal(a, b) {
            if (a.explorerIcon === b.explorerIcon &&
                a.iconColor === b.iconColor &&
                a.behavior.download === b.behavior.download &&
                a.behavior.app === b.behavior.app &&
                a.behavior.browser == b.behavior.browser) {
                if (a.behavior.app) {
                    return a.behavior.appID === b.behavior.appID;
                }
                return true;
            }
            return false;
        }
        return {
            ext: function(name) {
                return name.slice(name.lastIndexOf(".") + 1);
            },
            explorerIcon: function(filetype) {
                return get(filetype).explorerIcon;
            },
            iconColor: function(filetype) {
                return get(filetype).iconColor;
            },

            behavior: function(filetype) {
                var file = get(filetype);

                var apps = rMain.get("apps");
                if (file.behavior.app && !apps[file.behavior.appID]) {
                    file.behavior.app = false;
                    file.behavior.browser = true;
                }

                return file.behavior;
            },
            set: function(file) {
                var ext = this.ext(file.name);
                var current = get(ext);

                if (file.behavior) {
                    current.behavior = file.behavior;
                }
                if (file.explorerIcon) {
                    current.explorerIcon = file.explorerIcon;
                }
                if (file.iconColor) {
                    current.iconColor = file.iconColor;
                }

                if (equal(current, def(ext))) {
                    return;
                }

                var files = settings.get("files", {});
                files[ext] = current;

                settings.put("files", files);
            },
            default: function(filetype) {
                var files = settings.get("files", {});

                delete files[filetype];
                settings.put("files", files);
            },
        };

    }

    function Settings() {
            var url = "/v1/datastore/" + fh.auth.user + "/explorerSettings.ds";
            this.ds = new fh.Datastore(url);
            this.settings = {};

            function kvToObj(array) {
                var obj = {};
                for (var i = 0; i < array.length; i++) {
                    obj[array[i].key] = array[i].value;
                }
                return obj;
            }

            //Load All Settings
            this.load = function(postLoad) {
                fh.properties.get(url)
                    .done(function() {
                        this.ds.iter({})
                            .done(function(result) {
                                this.settings = kvToObj(result.data);
                                postLoad();
                            }.bind(this))
                            .fail(function(result) {
                                error(result);
                            });
                    }.bind(this))
                    .fail(function(result) {
                        // if not exists, create it
                        if (result.status === 404) {
                            fh.datastore.new(url)
                                .done(function() {
                                    this.ds.iter({})
                                        .done(function(result) {
                                            this.settings = kvToObj(result.data);
                                            postLoad();
                                        }.bind(this))
                                        .fail(function(result) {
                                            error(result);
                                        });
                                }.bind(this))
                                .fail(function(result) {
                                    error(result);
                                });
                        }
                    }.bind(this));
            };
            this.get = function(setting, defaultValue) {
                if (this.settings.hasOwnProperty(setting)) {
                    return this.settings[setting];
                } else {
                    return defaultValue;
                }
            };
            this.put = function(setting, value) {
                this.settings[setting] = value; //make sure setting takes effect immediately
                this.ds.put(setting, value)
                    .done(function() {
                        this.settings[setting] = value;
                    }.bind(this))
                    .fail(function(result) {
                        error(result);
                    });
            };

        } //Settings

    function buildDefaultApps() {
        return {
            "ds": "datastore",
            "odf": "webodf",
            "odt": "webodf",
            "ods": "webodf",
            "odp": "webodf",
            "mmap": "mindmap",
            "mup": "mindmap",
        };
    }


    $(document).keydown(function(e) {
        if (e.keyCode === 46) { //del
            rMain.fire("deleteSelect");
        }
    });


}); //end ready


if (!window.location.origin) {
    //for IE
    window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
}
