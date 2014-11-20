// Copyright 2014 Tim Shannon. All rights reserved.
// Use of this source code is governed by the MIT license
// that can be found in the LICENSE file.

$(document).ready(function() {
    var timer;
    var defaultIcons = buildDefaultIcons();
    var settings = new Settings();
    settings.stars = new Stars();

    var rNav = new Ractive({
        el: "#nb",
        template: "#tNav",
    });

    var rMain = new Ractive({
        el: "#pageContainer",
        template: "#tMain",
        data: {
            files: {},
            datastores: {},
            stars: {},
        },
    });

    getApps();

    settings.load(setRoot);


    //events
    rMain.on({
        "fileTreeSelect": function(event) {
            selectFolder(keypathFromTree(event.keypath, false));
        },
        "dsTreeSelect": function(event) {
            selectFolder(keypathFromTree(event.keypath, true));
        },
        "explorerSelect": function(event) {
            if (rMain.get("selectKeypath") === "stars") {
                openUrl(event.context.url);
                return;
            }
            selectFolder(event.keypath.replace("currentFolder", rMain.get("currentKeypath")));
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
            var keypath = keypathFromTree(event.keypath, event.component.data.dsTree);
            updateFolder(event.context.url, keypath);
            if (event.keypath !== "root") {
                rMain.set(keypath, setFileType(rMain.get(keypath)));
            }
        },
        "star": function(event) {
            var url = event.context.url;
            if (settings.stars.isStar(url)) {
                settings.stars.remove(url);
                rMain.set("currentFolder.starred", false);
                return;
            }

            settings.stars.add(url, event.context.name);
            rMain.set("currentFolder.starred", true);
        },
        "viewStarred": function(event) {
            selectFolder("stars");
        },
        "newFolder": function(event) {
            rMain.set("newFolderName", null);
            $("#newFolder").modal();
        },
        "newFolderSave": function(event) {
            $("#newFolder").modal("hide");
            event.original.preventDefault();
            var newUrl = fh.util.urlJoin(event.context.currentFolder.url, event.context.newFolderName);
            fh.file.newFolder(newUrl)
                .done(function() {
                    updateFolder(event.context.currentFolder.url, event.context.currentKeypath);
                })
                .fail(function(result) {
                    error(result.message);
                });
        },
        "removeStar": function(event) {
            var stars = rMain.get("currentFolder.children");
            settings.stars.remove(event.context.url);
            stars.splice(event.index.i, 1);
        },
        "selectApp": function(event) {
            if (event.index) {
                setRoot(event.index.i);
            } else {
                setRoot();
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
        },
        "renameFolder": function(event) {

        },
        "deleteFolder": function(event) {
            fh.file.delete(event.context.url);
            selectFolder(parentKeypath(rMain.get("currentKeypath")));
            settings.stars.remove(event.context.url);
        },
    });

    //functions
    function selectFolder(keypath) {
        var folder = rMain.get(keypath);

        document.title = folder.name + " - Explorer - freehold";
        rMain.set("currentFolder", folder);
        rMain.set("currentKeypath", keypath);
        openParent(keypath);

        rMain.set("selectKeypath", keypath);
        if (keypath === "stars") {
            updateStarFolder();
            return;
        }

        updateFolder(folder.url, keypath);
        buildBreadcrumbs(keypath);

        if (settings.stars.isStar(folder.url)) {
            rMain.set("currentFolder.starred", true);
        }
    }

    function updateFolder(url, keypath) {
        fh.properties.get(url)
            .done(function(result) {
                mergeFolder(result.data, keypath + ".children");
            });
    }

    function setRoot(app) {
        rMain.set("app", app);
        rMain.set("files", {
            url: fh.util.urlJoin(app, "/v1/file/"),
            name: "files",
            canSelect: true,
            selected: true,
            iconClass: "fa fa-folder-open",
            children: [],
        });
        rMain.set("datastores", {
            url: fh.util.urlJoin(app, "/v1/datastore/"),
            name: "datastores",
            canSelect: true,
            iconClass: "fa fa-database",
            children: [],
        });
        rMain.set("stars", {
            name: "Starred",
            canSelect: true,
            iconClass: "glyphicon glyphicon-star",
        });
        rMain.set("listView", settings.get("listView", false));
        selectFolder("files");
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
        var urlParts = url.split("/");
        var app;
        var rootPlace = 2;

        if (urlParts[1] !== "v1") {
            app = urlParts[1];
            rootPlace = 3;
        }

        setRoot(app);

        /*if (url.lastIndexOf("/") === url.length - 1) {*/
        /*url = url.slice(0, url.length - 1);*/
        /*}*/

        updateFilesTo(urlParts[rootPlace] === "file" ? "files" : "datastores", url);

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
                    return;
                }


                var nextUrl = fh.util.urlJoin(newUrl, to.slice(newUrl.length).split("/")[0], "/");

                for (var i = 0; i < result.data.length; i++) {
                    if (nextUrl == result.data[i].url) {
                        updateFilesTo(newKeypath + "." + i, to);
                    }
                }
            })
            .fail(function(result) {
                //TODO: Proper Invalid file error
                error("Bookmark may be invalid: " + result.message);
            });
    }

    function mergeFolder(newFiles, keypath) {
        var current = rMain.get(keypath);

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
                if (index >= 0) {
                    mergeAttributes(current[index], newFiles[i]);
                }
            }
            newFiles[i] = setFileType(newFiles[i]);
        }

        rMain.set(keypath, newFiles);
        rMain.update("currentFolder"); //update currentFolder so view reflects new data
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
        if (!file.hasOwnProperty("size")) {
            file.explorerIcon = "folder";
            file.isFolder = true;
            file.canSelect = true;
            if (file.open) {
                file.iconClass = "fa fa-folder-open";
            } else {
                file.iconClass = "fa fa-folder";
            }
            if (!file.hasOwnProperty("children")) {
                file.children = [];
            }

        } else {
            file.explorerIcon = icon(file.name);
            file.hide = true; //hide from treeview
            file.humanSize = filesize(file.size); //thanks Jason Mulligan (https://github.com/avoidwork/filesize.js)
        }

        if (file.modified) {
            file.modifiedDate = new Date(file.modified).toLocaleString();
        }
        return file;
    }

    function icon(file) {
        var ext = file.slice(file.lastIndexOf(".") + 1);

        return rMain.get("settings.files." + ext + ".icons.") || defaultIcons[ext] || "file-o";
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

    function updateStarFolder() {
        var stars = settings.get("starred", {});
        var files = Object.getOwnPropertyNames(stars);
        var folder = rMain.set("currentFolder", {
            "name": "stars"
        });

        for (var i = 0; i < files.length; i++) {
            var keypath = "currentFolder.children." + i;
            if (files[i] === "/v1/file/") {
                rMain.set(keypath, {
                    name: "files",
                    explorerIcon: "fa fa-folder-open",
                    url: files[i],
                    isFolder: true,
                });
                continue;
            }

            if (files[i] === "/v1/datastore/") {
                rMain.set(keypath, {
                    name: "datastores",
                    explorerIcon: "fa fa-database",
                    url: files[i],
                    isFolder: true,
                });
                continue;
            }

            getFile(files[i], keypath);
        }
    }

    function getFile(url, keypath) {
        if (url.lastIndexOf("/") === url.length - 1) {
            url = url.slice(0, url.length - 1);
        }

        fh.properties.get(url)
            .done(function(result) {
                var file = result.data;

                if (!file.hasOwnProperty("url")) {
                    file.url = url;
                }
                if (!file.hasOwnProperty("name")) {
                    file.name = url.split("/").pop();
                }
                file = setFileType(file);
                rMain.set(keypath, result.data);
            })
            .fail(function(result) {
                rMain.set(keypath, {
                    name: "Error Loading File: " + result.message,
                    explorerIcon: "exclamation-triangle",
                });
            });
    }

    function error(errMsg) {
        rNav.set("error", errMsg);
    }


    function getApps() {
        fh.application.installed()
            .done(function(result) {
                rMain.set("apps", result.data);
            })
            .fail(function(result) {
                error(result.message);
            });
    }


    function Stars() {
        return {
            add: function(url, name) {
                var stars = settings.get("starred", {});
                stars[url] = name;
                settings.put("starred", stars);
            },
            remove: function(url) {
                var stars = settings.get("starred", {});
                delete stars[url];
                settings.put("starred", stars);
            },
            isStar: function(url) {
                var stars = settings.get("starred", {});
                if (stars.hasOwnProperty(url)) {
                    return true;
                }
                return false;
            },
        };
    }

    function FileTypeSettings() {
        //TODO: icon / application settings for specific filetypes
        return {};
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
                                error(result.message);
                            });
                    }.bind(this))
                    .fail(function(result) {
                        // if not exists, create it
                        if (result.message == "Resource not found") {
                            fh.datastore.new(url)
                                .done(function() {
                                    this.ds.iter({})
                                        .done(function(result) {
                                            this.settings = kvToObj(result.data);
                                            postLoad();
                                        }.bind(this))
                                        .fail(function(result) {
                                            error(result.message);
                                        });
                                }.bind(this))
                                .fail(function(result) {
                                    error(result.message);
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
                this.ds.put(setting, value)
                    .done(function() {
                        this.settings[setting] = value;
                    }.bind(this))
                    .fail(function(result) {
                        error(result.message);
                    });
            };

        } //Settings

    function buildDefaultIcons() {
        return {
            "ds": "database",
            "xls": "file-excel-o",
            "ods": "file-excel-o",
            "xlsx": "file-excel-o",
            "pdf": "file-pdf-o",
            "wav": "file-audio-o",
            "ogg": "music",
            "mp3": "music",
            "flac": "music",
            "odt": "file-word-o",
            "doc": "file-word-o",
            "docx": "file-word-o",
            "zip": "file-archive-o",
            "gz": "file-archive-o",
            "7z": "file-archive-o",
            "rar": "file-archive-o",
            "png": "file-image-o",
            "jpg": "file-image-o",
            "jpeg": "file-image-o",
            "gif": "file-image-o",
            "bmp": "file-image-o",
            "mov": "file-movie-o",
            "mpg": "file-movie-o",
            "mpeg": "file-movie-o",
            "mkv": "file-movie-o",
            "ogv": "file-movie-o",
            "avi": "file-movie-o",
            "txt": "file-text-o",
            "xml": "file-code-o",
            "html": "file-code-o",
            "js": "file-code-o",
            "css": "file-code-o",
            "sh": "file-code-o",
            "epub": "book",
            "mobi": "book",
            "azw3": "book",
            "azw": "book",
            "kf8": "book",
            "torrent": "share-alt",
        };

    }
}); //end ready
