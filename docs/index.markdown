Contents
=========

* [API Conventions](#api)
* [Storage](#storage)
	* [File](#file)
	* [Datastore](#datastore)
	* [Properties](#properties)
* [Core Datastores](#core)
	* [Authentication](#auth)
		* [User](#user)
		* [Token](#token)
		* [Session](#session)
	* [Settings](#settings)
	* [Applications](#application)
	* [Logs](#logs)
	* [Communication](#communication)
	* [Calendar](#calendar)
	* [Tasks](#tasks)
	* [Backup](#backup)


<a name="api"></a>API Conventions
==============
Freehold's REST api will generally use the following conventions.

* GET will retrieve
* POST will create
* PUT will update
* Delete will remove

Responses will be in the JSEND (http://labs.omniti.com/labs/jsend) format with appropriate
http status codes.

```
{
	status: <"success"|"fail"|"error">,
	data: {
		<content>	
	}
}
```

* success - Submission succeeded
* fail - There was a problem with the data submitted - client error - usually (400)
* error - There was a problem on the server - server error - usually (500)

If status is error look for `data.message`.  It will always be there in error / failure returns. 
For multiple failures, there will be a failure item with a message for each that has failed.
```
{
	status: "fail",
	data: [
		{name: "item1"},
		{name: "item2"},
		{name: "item4"},
		{name: "item6"}
	],
	failures: [
		{message: "item 3 failed", data: {name: "item3"}},
		{message: "item 5 failed due to no reason", data: {name: "item5"}}
	]
}

```

For most cases with multiple item returns data will return an array, but for instances where there is a unique identifier for a given row (such as a Users, applications, etc), a hash map will instead be returned with the unique identifier as the hash key.  Pay attention to the documentation to see whether an array or a map is used.

Authentication will be done through the Basic HTTP Auth in the header

Username is always required, and Password can be the users password, or a valid security token. See 
Authentication section for more detail.

If the Auth header isn't included in the request, then cookies will be checked for a valid session.
The Auth header will always override any authentication via cookie.

GET requests with a JSON payload will be accepted both in the request body or as a parameter `https://host/v1/file/?<jsonpayload>`. For writing applications, making an AJAX GET request with a JSON payload should just work. 

You'll notice the API is versioned.  The version number in the url paths will only change if there is a backwards incompatible change to that specific area.  Meaning if I remove a field from the datastore API, or change the behavior of it, then the datastore path will become `/v2/datastore/` and all other API paths will remain v1 until a backwards incompatible change is made to them.  Previous versions of an API path should still retain their same response and behavior even if a new version of the path exists.

<a name="#storage"></a>Storage
=======
You can store data either in files directly or in a key / value DataStore.
Each File / Datastore can have Read or Write permissions applied at one of three
levels. 

* Private - Applies to the owner of the current file
* Public - Applies to everyone
* Friend - Applies to everyone with a valid login to this freehold instance

Default permissions are Private R/W only.  Permissions only apply to an individual object 
(File or Datastore).  New Files or Datastores can only be created by the current authenticated user. Permissions can only
be granted by the file owner. Files can only be deleted by their owners.

Datastore folders are handled differently from File folders. With datastores, there currently is no concept of Folder permissions, or inheritance.
 Whether or not a datastore folder exists is only known to authenticated users. 

Files folders have permissions at the folder level which determine if a folder can be seen, or if new files can be created in it.

If a user doesn't have permissions to read a file they will get a 404.

For more information on permissions see [permissions.markdown](/docs/permissions.markdown).

Authenticated access is granted either by having an active cookie with proper session credentials
or including an AuthToken field with the proper token in the request

Application Specific Storage paths will be prefixed with the given applications identifier.

* `app-id`/v1/file/`path to file`
* `app-id`/v1/properties/file/`path to file`
* `app-id`/v1/datastore/`path to file`

<a name="file"></a> File
----
### /v1/file/<path to file>

**GET** - Works just like you think it should. 
```
GET /v1/file/important-stuff/spreadsheet1.ods
GET /v1/file/static/header.jpg
GET /v1/file/blog/index.html
```

GET at a directory redirects to the /v1/properties/file/ listing of the directory. If a file called index. (.html, .markup, .jpg, etc) is found in the directory, it will be loaded automatically instead of redirecting to /v1/properties/file/.

If a GET is called against a file of extension type *.markdown* the markdown will automatically be
rendered as html (thanks to https://github.com/russross/blackfriday) such as with this file.

**POST** - Add a new file.  Can be used to create an empty folder if now form-data is passed in.
multipart/formdata are accepted.  In order to preserver the original modified date of the file, you should set the `Fh-Modified` header to the modified date of the file being uploaded.  If not set, the modified date will be the date the file was uploaded.  The date should be in the ISO8601 format / RFC3339 format.

This example will upload profile.jpg in it
```
POST "/v1/file/new-directory/"
Fh-Modified: 2015-03-16T09:51:16-05:00

------WebKitFormBoundary
Content-Disposition: form-data; name="files[]"; filename="profile.jpg"
Content-Type: image/jpeg
...
------WebKitFormBoundary--

Response (201):
{
	status: "success",
	data: {
		url: "/v1/file/new-directory/profile.jpg"
	}
}
```

If the file already exists:
```
Response (500):
{
	status: "error",
	data: {
		message: "file already exists",
		url: "/v1/file/new-directory/profile.jpg"
	}
}
```
To replace an existing file, you'll need to delete the previously uploaded file first, or call PUT on an existing file to replace it.

Multiple file posts will have multiple entries in the data field.
```
Response (201):
{
	status: "success",
	data: [
		{
			url: "/v1/file/new-directory/profile.jpg"
		},
		{
			url: "/v1/file/new-directory/header.jpg"
		},
		{
			url: "/v1/file/new-directory/favicon.ico"
		}
	]
}

Error Response (500):
{
	status: "fail",
	data: [
			{	url: "/v1/file/new-directory/profile.jpg"}
	],
	failures: [
		{	message: "file already exists",
			data: {	url: "/v1/file/new-directory/header.jpg"}
		},
		{	message: "not enough disk space",	
			data: {url: "/v1/file/new-directory/wikipedia.zip"}
		}
	]
}
```

**PUT** - Replace a previously uploaded file.  You must be the owner.  This changes the modified date of the file.
```
PUT "/v1/file/new-directory/"
------WebKitFormBoundary
Content-Disposition: form-data; name="files[]"; filename="profile.jpg"
Content-Type: image/jpeg
...
------WebKitFormBoundary--

Response (201):
{
	status: "success",
	data: {
		url: "/v1/file/new-directory/profile.jpg"
	}
}
```

**PUT** - Move or rename a previously uploaded file.  You must have folder write access on source and dest.
```
PUT "/v1/file/wrong-dir/oldname.txt"
{
	move: "/v1/file/new-dir/newname.txt"
}


Response (201):
{
	status: "success",
	data: {
		url: "/v1/file/new-directory/profile.jpg"
	}
}
```



**DELETE** - You must have write access to the parent folder.

*Delete a single file*
```
DELETE "/v1/file/xml_SOAP_spec.doc"

Response (200):
{
	status: "success",
	data: {
		url: "/v1/file/xml_SOAP_spec.doc"
	}
}
```

*Delete a folder and it's contents*
```
DELETE "/v1/file/3001_lolcat_pictures/"

Response (200):
{
	status: "success",
	data: {
			url: "/v1/file/3001_lolcat_pictures/"},
	}
}
```


<a name="datastore"></a>Datastore
---------
### /v1/datastore/`path to datastore`/

A DataStore is file that contains a collection of keys and their values. 

As with files, only authenticated users can create new datastore files, and directories will be auto-created.  
Empty directories will be automatically removed. 

Permissions are granted on per file basis just like a regular file.  If an application wants to have separate data for
separate users, it will need to create separate datastore files with separate permissions.

Permissions are designed to be simple so there is no granular control over what a group can, or cannot write to in a 
given datastore. If you grant a Friend access to Write to a datastore, they can delete your records, and you can delete
theirs.

Public write access to a datastore is automatically rate-limited based on ip address.  Limits can be configured
with a Core Setting.  This allows an application to setup scenarios like Comments where public users can leave comments,
but the rate limiting should prevent spammy users.

Public read access can read keys but not download the entire datastore file.

Currently the datastore is backed by [BoltDB](https://github.com/boltdb/bolt), but other storage backends could potentially be used as well.

**POST**

*Create a new datastore file*
```
POST /v1/datastore/personal/bookmarks.ds

Response (201):
{
	status: "success",
	data: {
		url: "/v1/datastore/personal/bookmarks.ds"
	}
}
```

Post will also accept a multipart file upload like a regular file if the file of content type application/freehold-datastore. This will allow for uploading backups of other user's datastore files.
```
POST "/v1/datastore/backups/"
------WebKitFormBoundary
Content-Disposition: form-data; name="files[]"; filename="bookmarks_backup.ds"
Content-Type: application/freehold-datastore
...
------WebKitFormBoundary--

Response (201):
{
	status: "success",
	data: {
		url: "/v1/file/new-directory/bookmarks_backup.ds"
	}
}
```

**GET**

*Download the entire datastore file (for sharing, backups, etc)*
```
GET /v1/datastore/personal/bookmarks.ds

Response (200): bookmarks.ds file
```

*Get a value from the datastore* 
```
GET /v1/datastore/personal/bookmarks.ds
{
	key: "http://golang.org/pkg"
}

Response (200):
{
	status: "success",
	data: {
			tags: "programming,golang,go,awesome"
	}
}
```

*Get Min or Max Key in the store*
```
GET /v1/datastore/personal/top10.ds
{
	max: {}
}

Response (200):
{
	status: "success",
	data: {
			key: 10,
			value: "ten"
	}
}

GET /v1/datastore/personal/top10.ds
{
	min: {}
}

Response (200):
{
	status: "success",
	data: {
			key: 1,
			value: "one"
	}
}
```



*Iterate through values in the collection*
```
GET /v1/datastore/personal/bookmarks.ds
{
	iter: {
		from: <key>,
		to: <key>,
		skip: <count>,
		limit: <count>,
		order: <"asc"|"dsc">
		regexp: <regular expression to match against key>
	}
}
```
All fields are optional with the defaults below:

* from - defaults to minimum key in the collection
* to - defaults to maximum key in the collection
* skip - defaults to 0
* limit - defaults to returning all records
* regexp - defaults to matching all keys
* order - defaults to asc unless from > to, then dsc

Skip and limit only apply to records that match the regular expression (if one is passed in).  So if a value doesn't match the regular expression, it doesn't count as a "skipped" value.  Or to put it another way, skip and limit apply to the resulting set after the regular expression is applied.

If *from* is greater than *to* and no order is specified, then descending order is implied.  If order is specified, then *from* and *to* are automatically corrected to return the correct order.

*Example: Consider a datastore with 50 items with keys 1 - 50*

Get the 3rd page of 10 items per page in the datastore
```
GET /v1/datastore/50items.ds
{
	iter: {
		skip: 30,
		limit: 10
	}
}

Response (200):
{
	status: "success",
	data: [
		{key: 31, value: "Data"},
		{key: 32, value: "Data"},
		{key: 33, value: "Data"},
		{key: 34, value: "Data"},
		{key: 35, value: "Data"},
		{key: 36, value: "Data"},
		{key: 37, value: "Data"},
		{key: 38, value: "Data"},
		{key: 39, value: "Data"},
		{key: 40, value: "Data"}
	]
}
```

*Get all the records where the key is greater than or equal 43*
```
GET /v1/datastore/50items.ds
{
	iter: {
		from: 43
	}
}

Response (200):
{
	status: "success",
	data: [
		{key: 43, value: "Data"},
		{key: 44, value: "Data"},
		{key: 45, value: "Data"},
		{key: 46, value: "Data"},
		{key: 47, value: "Data"},
		{key: 48, value: "Data"},
		{key: 49, value: "Data"},
		{key: 50, value: "Data"},
	]
}
```
Both *from* and *to* are inclusive of the specified key in their range.  If you need more complex querying than the datastore interface provides, consider using an in-memory database such as [lokijs](http://lokijs.org).

**PUT** - Simply insert your JSON object(s), the object's top level keys will become the keys for the datastore.  
```
PUT /v1/datastore/personal/bookmarks.ds
{
	"http://golang.org/pkg": {
			tags: "programming,golang,go,awesome"
	}
}

Response (200):
{
	status: "success"
}


If the datastore file doesn't exist:
Response (404):
```

Since JSON keys are always strings, if you want to use a non-string as a key value, you can specify it with the key / value object.  This is useful for when you want key comparisons for iterating on something other than a string value. Keep in mind that javascript implicitly converts object keys to strings, and 10 != "10" as a datastore key but with javascript obj[10] == obj["10"].
```
PUT /v1/datastore/personal/bookmarks.ds
{
		"key": 1234,
		"value":	{tags: "programming,golang,go,awesome"}
	}
}

Response (200):
{
	status: "success"
}

```

*Get count of records*
```
GET /v1/datastore/personal/top10.ds
{
	count: {}
}

Response (200):
{
	status: "success",
	data: 10
}

```

You can combine count with iter.  Note that *limit* in iter object is ignored.
```
GET /v1/datastore/50items.ds
{
	count{},
	iter: {
		from: 43
	}
}

Response (200):
{
	status: "success",
	data: 8
}
```



**DELETE** 

*Delete a datastore file* - Requires private/owner permissions, if the last file in a datastore folder is deleted, then the folder is cleaned up.
```
DELETE /v1/datastore/personal/bookmarks.ds

Response (200):
{
	status: "success",
	data: {
		url: "/v1/datastore/personal/bookmarks.ds"
	}
}
```

*Delete a datastore entry* - Requires write permissions
```
DELETE /v1/datastore/personal/bookmarks.ds
{
	key: "http://golang.org/pkg",
}

Response (200):
{
	status: "success"
}
```


<a name="properties"></a>Properties
----
### /v1/properties/file/<path to file>
or
### /v1/properties/datastore/<path to datastore>

Properties mirrors the same paths as /v1/file/ or /v1/datastore/ but instead shows meta data on the files instead of retrieving the files themselves.  This allows us to take advantage of browser caching for serving files without interfering with making GET requests to retrieve information on the files themselves.  It also allows for a way to retrieve folder listings for folders which contain index files.  Files that start with "." are ignored by freehold, regardless of the platform it's running on.

If a user has permissions to the /v1/file/ or /v1/datastore/ it has permissions to the /v1/properties/ path as well.  However PUTting permissions requires Private/owner permissions.  Reading permissions requires read access, but permissions requests are not allowed for public access.

TODO: Encryption. Requires key passed in header

**GET** - Get Info on a given file; permissions, size in bytes, etc.
```
GET /v1/properties/file/important-stuff/spreadsheet1.ods

Response (200):
{
	status: "success",
	data: {
		name: "spreadsheet1.ods",
		url: "/v1/file/important-stuff/spreadsheet1.ods"
		size: 1048579,
		modifiedDate: "2014-04-23T18:25:43.511Z"
		permissions: {
			owner: "tshannon",
			public: "",
			friend: "r",
			private: "rw"
		}
	}
}


GET /v1/properties/datastore/personal/bookmarks.ds

Response (200):
{
	status: "success",
	data: {
		name: "bookmarks.ds",
		url: "/v1/datastore/personal/bookmarks.ds"
		size: 148579,
		permissions: {
			owner: "tshannon",
			public: "",
			friend: "r",
			private: "rw"
		}
	}
}
```

If a GET request is made at a folder, the file info for the list of files in the folder is returned.

*Get Permissions of all files in a folder*
```
GET /v1/properties/file/family-pictures/

Response (200):
{
	status: "success",
	data: [
		{	name: "IMG01.jpg", 
			url: "/v1/file/family-pictures/IMG01.jpg", size: 1048579,
			permissions: {owner: "tshannon", public: "",	friend: "r",	private: "rw"}},
		{name: "IMG02.jpg", 
			url: "/v1/file/family-pictures/IMG02.jpg", size: 1029310,
			permissions: {owner: "tshannon", public: "",	friend: "r",	private: "rw"}},
		{name: "IMG03.jpg", 
			url: "/v1/file/family-pictures/IMG03.jpg" size: 1038536,
			permissions: {owner: "tshannon", public: "",	friend: "r",	private: "rw"}},
	]
}


```

*Get Properties of a folder* Note the lack of a trailing slash.
```
GET /v1/properties/file/family-pictures

Response (200):
{
	status: "success",
	data: 
		{	name: "family-pictures", 
			url: "/v1/file/family-pictures/", 
			isDir: true,
			permissions: {owner: "tshannon", public: "",	friend: "r",	private: "rw"},
		}


```


**PUT** - Updating existing file info.  If the file is not found a 404 will be sent.

*Setting File Permissions* - r=read  w=write
```
PUT "/v1/properties/file/notes/history.txt"

{
	permissions: {
		public: "",
		friend: "rw"
	}
}

Response (200):
{
	status: "success",
	data: {
		url: "/v1/file/blog/post.html"
	}
}
```
By default new files are private rw only. By not specifying private permissions the file retains its
existing permissions for that group.

*Set permissions for all files in a directory* note the trailing slash.
```
PUT "/v1/properties/file/blog/published/"

{
	permissions: {
		owner: "tshannon",
		public: "r",
		friend: "r"
	}
}

Response (200):
{
	status: "success",
	data: {
		[
			{url: "/v1/file/blog/2014-01-01.html"},
			{url: "/v1/file/blog/2014-01-12.html"},
			{url: "/v1/file/blog/2014-03-06.html"}
		]
	}
}
```

*Set Permissions for a datastore*
```
PUT "/v1/properties/datastore/passwords.ds"

{
	permissions: {
		owner: "tshannon",
		public: "",
		friend: ""
	}
}

Response (200):
{
	status: "success",
	data: {
		url: "/v1/datastore/passwords.ds",
	}
}

```


* * *


<a name="core"></a>Core Datastores
==============
Data used for the running of the freehold instance are stored in the *core* datastore. The core datastore is designed to only be 
modified via specific REST requests and not directly. It contains data used for authentication, authorization, session data, 
permissions, and settings.

The core datastore has a different permissions model than normal datastores. Permissions are granted based on the type of 
request made.

The first user created in the system is automatically an administrator.  Only other administrators can make an existing user an
administrator.  Once a user is made an administrator it cannot be removed by other administrators, but it can be reliquished by
the user themself.


<a name="auth"></a>Authentication
--------------
Authentication will be done through the Basic HTTP Auth set in the request header.

Username is always required, and Password can be the users password, or a valid security token.

A *Security Token* is a cryptographically random value that may have a preset expiration when it will no
longer be valid.  Security Tokens generated by a user currently grant all the permissions the user has
when used.  If you want to grant less permissions, create another user with less access to generate  tokens
from.

If the Auth header isn't included in the request, then cookies will be checked for a valid session.
The Auth header will always override any authentication via cookie.  If a cookie is used to authenticate,
then the proper CSRF Token will need to be sent with each PUT, POST, and DELETE via the X-CSRFToken header.
More info on this under Sessions.

Authentication and Session data are stored in the core datastore, and accessed via the path
*/v1/auth/*.

//TODO: Two Factor Authentication ala Google Authenticator / Authy, etc.

### /v1/auth/

Information about the current authenticated user.
```
{
		user: <current user>, 
		name: <current user's name>, 
		email: <current user's email address>,
		homeApp: <current user's home app>,
		admin: <Is the current user an admin>,
		type: <"session" | "token" | "basic",
		expires: <expiration of access, if it exists>,
		resource: <specified auth resource (token only)>,
		permissions: <specified auth permissions (token only)>
}

```

**GET**
```
GET /v1/auth

Response (200):
{
	status: "success",
	data: {
			user: "tshannon", 
			name: "Tim Shannon", 
			email: "shannon.timothy@gmail.com",
			homeApp: "home",
			admin: true,
			type: "session",
			expires: "2044-04-23T18:25:43.511Z"
	}
}
```

*If user isn't authenticated*
```
GET /v1/auth

Response (200):
{
	status: "success",
	data: {
			type: "none",
	}
}
```

### /v1/auth/user <a name="user"></a>

Information on Users in the system.  Stored in the core *user* datastore.
```
core/user.ds
{
	key: <username>,
	value: {
		password: <password>,
		name: <name>,
		homeApp: <app-name>,
		admin: <true | false>
	}
}
```

**GET**

*List all users in the system* - available to Private, Friend, and Admin
```
GET /v1/auth/user

Response (200):
{
	status: "success",
	data: 
		"tshannon":
		{
			name: "Tim Shannon", 
			homeApp: "home",
			admin: true
		},
		"otheruser":
		{
			name: "Other User", 
			homeApp: "home",
			admin: false
		}
}
```

*Get a single user* - available to Private, Friend, and Admin
```
GET /v1/auth/user
{
	user: "tshannon"
}

Response (200):
{
	status: "success",
	data: {
		name: "Tim Shannon", 
		homeApp: "home",
		admin: true
	}	
}
```

**POST**

*Create a new user* - All fields are optional except user and password - Available to admins only
```
POST /v1/auth/user
{
	user: "newUser",
	password: "CorrectHorseBatteryStaple",
	name: "New User", 
	homeApp: "home",
	admin: false
}

Response (201):
{
	status: "success"
}
```

**PUT**

*Update an existing user* - Admin can update all users, users can update themselves only. User password changes cannot be made from security Tokens.
```
PUT /v1/auth/user
{
	password: "CorrectHorseBatteryStaple",
	name: "New User", 
	homeApp: "home",
}

Response (200):
{
	status: "success"
}
```

*Make user an Admin* - Admin Only
```
PUT /v1/auth/user
{
	user: "newuser",
	admin: true
}

Response (200):
{
	status: "success"
}
```

*Relinquish Admin* - Admin's Self Only
```
PUT /v1/auth/user
{
	admin: false
}

Response (200):
{
	status: "success"
}
```

**DELETE**

*Remove user* - Admin or Self only
```
DELETE /v1/auth/user
{
	user: "newuser"
}

Response (200):
{
	status: "success"
}

```

### /v1/auth/token  <a name="token"></a>

A *Security Token* is a cryptographically random value that may have a preset expiration when it will no
longer be valid.  

Security tokens can be granted for specific resources and specific permissions (equal lower than the existing access). 
In this case the user generating the token grants their permissions but only if the resource path matches the one for the token.  This would be a way to grant public access temporarily to private files.

Security tokens cannot be updated once created.  If you want to change permissions, or resource on a token, you need to delete the token and generate a new one with a new token identifier.

Use cases for Security Tokens would be setting up external applications without needing to use your password (like a local desktop sync, or a smartphone application), or temporarily sharing a file with another person without needing to give them a logon to your freehold instance.

The actual token value is only available when the token is requested. If the *RequirePasswordToGenerateToken* setting is true, then tokens can only be requested if the Basic Auth header is set (i.e they can't be requested from sessions).  New tokens can never be generated from an existing token.  The token value cannot be retrieved again once created with subsequent All or Get calls.

```
core/token.ds
{
	key: <user>_<token>,
	value: {
		id:	<unique identifier for a token>,
		name: <name / reason for token>,
		expires: <expiration date>,
		resource: <resource path>,
		permission: {<permission>}
	}
}
```

**GET**

*List all tokens for the current user*
```
GET /v1/auth/token

Response (200):
{
	status: "success",
	data: [
		{id: "aaaaaaaaaaaaaaaaaaaaa", name: "android phone"},
		{id: "bbbbbbbbbbbbbbbbbbbbb", name: "testing", expires: "2044-04-23T18:25:43.511Z"},
		{id: "ccccccccccccccccccccc", name: "temp torrent share", expires: "2014-08-18T00:00:00.000Z", resource: "/v1/file/public/checkthisout.torrent"},
	]
}
```

*Get a single token*
```
GET /v1/auth/token
{
	id: "bbbbbbbbbbbbbbbbbbbbb"
}

Response (200):
{
	status: "success",
	data: {id: "bbbbbbbbbbbbbbbbbbbbb", name: "desktop file sync", expires: "2044-04-23T18:25:43.511Z"}
}
```

*Use a Token in a URL to retrieve a specific resource* - This only works on tokens that have specified a resource.
```
GET /v1/auth/token?user=tshannon&token=XZCIfzuCTLbdiifUSSonGDFmYPvEWzUx_pmgD_hRk_k

Retrieves the resource specified in the token.  Return a 404 if token is invalid or doesn't specify a resource.
```


**POST**

*Generate new token*  - If no expiration is specified then token is set to *TokenMaxDaysTillExpire* [setting](#settings).
```
POST /v1/auth/token
{
	name: "Full Sync Access"
}

Response (201):
{
	status: "success",
	data: {token: "XZCIfzuCTLbdiifUSSonGDFmYPvEWzUx_pmgD_hRk_k", id: "aaaaaaaaaaaaaa", name: "Full Sync Access"}
}
```

*Generate new token with expiration* - ISO8601 format / RFC3339 (.toJSON())
```
POST /v1/auth/token
{
	name: "Temporary full access",
	expires: "2044-04-23T18:25:43.511Z"
}

Response (201):
{
	status: "success",
	data: {token: "kkkkkkkkkkkkkkkkkkkkk", id: "aaaaaaaaaaaaaa", name: "Temporary full access", expires: "2044-04-23T18:25:43.511Z"}
}
```

*Generate new token for a specific resource* 
```
POST /v1/auth/token
{
	name: "Public comments",
	resource: "/v1/datastore/comments.ds"
}

Response (201):
{
	status: "success",
	data: {token: "lllllllllllllllllllll", id: "aaaaaaaaaaaaaa", name: "Public comments", resource: "/v1/datastore/comments.ds"}
}
```

*Generate new token for a specific resource with specific permissions* 
```
POST /v1/auth/token
{
	name: "Read Only comments",
	resource: "/v1/datastore/readonly.ds",
	permission: "r"

}

Response (201):
{
	status: "success",
	data: {token: "lllllllllllllllllllll", id: "aaaaaaaaaaaaaa", name: "Read Only comments", resource: "/v1/datastore/comments.ds"}
}
```


**DELETE**
```
DELETE /v1/auth/token
{
	id: "kkkkkkkkkkkkkkkkkkkkk",
}

Response (200):
{
	status: "success",
}
```

### /v1/auth/session <a name="session"></a>

A session refers to when the authentication is tracked via a cookie in the client's browser. Sessions
only support POST to create a new one and DELETE to remove or logout of the session.  

When a session is POSTed it creates a cookie with the user and unique session id in the client's browser.
If any request is GETed with a valid session (i.e. no Header Authentication), then a CSRF token is put in 
the header of that request (X-CSRFToken), and that token, **must be sent back via the same header with any PUT, POST, or DELETE requests
sent from the session, or they will fail**.

There is a core setting for maximum number of open sessions a user can have.  Once that limit is reached, the oldest session is automatically expired.

If a user has tries to make an unauthenticated requested, i.e. no header auth, and no session cookie,
they will be automatically redirected to the default home app's login screen (see settings to change this). If a session cookie is found, but expired, an error is returned.  Usually an application will handle the session expiration by showing a logon prompt on the current page to allow the user to re-authenticate.

```
core/session.ds
{
	key: <user>_<session-id>,
	value: {
		expires: <expiration date>,
		CSRFToken: <CSRF Token>,
		ipAddress: <ip address>
		created: <date session was created>
	}
}
```

**GET**

*List all sessions for the current user*
```
GET /v1/auth/session

Response (200):
{
	status: "success",
	data: [
		{id: "bbbbbbbbbbbbbbbbbbbbb", CSRFToken: "12345677", expires: "2014-04-23T18:25:43.511Z", ipAddress: "127.0.0.1", created: "2014-04-20T18:25:43.511Z"},
		"ccccccccccccccccccccc": {CSRFToken: "12345677", ipAddress: "127.0.0.1", created: "2014-04-20T18:25:43.511Z"},
		"lllllllllllllllllllll": {CSRFToken: "12345677", expires: "1900-00-00T00:00:00.000Z", ipAddress: "127.0.0.1", created: "2014-04-20T18:25:43.511Z"},
		"222222222222222222222": {CSRFToken: "12345677", expires: "1900-00-00T00:00:00.000Z", ipAddress: "127.0.0.1", created: "2014-04-20T18:25:43.511Z"}
	]
}
```

**POST**

*Creates a new session and writes a cookie to hold it* 

 This session cookie expires at the end of the browser's session since no expiration is specified.
```
POST /v1/auth/session

Response (201):
{
	status: "success",
}
```

 This session expires in the future. Note, it's not recommended to set session expirations out farther than 30 days, and this is enforced by the *SessionMaxDaysTillExpire* [setting](#settings) value.
```
POST /v1/auth/session
{
	expires: "2016-01-01T00:00:00.000Z"
}

Response (201):
{
	status: "success",
}
```

**DELETE**

*Log out of the current session* - expires the client's cookie as well
```
DELETE /v1/auth/session

Response (200):
{
	status: "success",
}
```

*Log out of a specific session* - Expires a specific session based on ID, If client cookie matches session ID, it will be expired as well.
```
DELETE /v1/auth/session
{
	id: "222222222222222222222"
}

Response (200):
{
	status: "success",
}
```

* * *

<a name="settings"></a> Core Settings 
-----------------------------
Freehold tries to have sane default settings that you can adjust as needed.  This will hopefully make the instance
easy to setup and get running, yet allow the admin to modify it's operation to their own needs.

Only Admin users can change settings, but all authenticated (non-public) users can view the current settings in
the system.

Individual user's settings should be managed on a per application basis in the given applications datastore.

Settings are intended to take effect immediately unless otherwise noted in the setting's description.

### /v1/settings

```
core/settings.ds
{
	key: <setting id>,
	value: {
		description: <setting description>,
		value: <setting value>
	}
}
```

**GET**

*List All settings* - All authenticated users
```
GET /v1/settings

Response (200):
{
	status: "success",
	data: 
		{
			"public-rate-limit": { 
				description: "Number of writes per minute per user for a single collection (can be decimal)", 
				value: 5},
			"default-home-app": { 
				description: "Default application used as the home app, where logins are redirected to.", 
				value: "home"},
			"application-allow-web-install": {
				description: "Whether or not applications can be installed from urls.", 
				value: false}
	}
}
```

*List a specific settings* - All authenticated users
```
GET /v1/settings
{
	setting: "public-rate-limit"
}

Response (200):
{
	status: "success",
	data: {
			description: "Number of writes per minute per user for a single collection", 
			value: 5
	}
}
```

**PUT**

*Set a Setting* - Admins only
```
PUT /v1/settings
{
	setting: "public-rate-limit",
	value: 10
}

Response (200):
{
	status: "success",
}
```

**DELETE**

*Default a Setting* - Remove any user set value, and use initial defaults - Admins only
```
DELETE /v1/settings
{
	setting: "public-rate-limit",
}

Response (200):
{
	status: "success",
}
```

* * *

<a name="application"></a> Applications
----------------------------------------
Applications are bundles of files in a zip file that only Admins can install.  Once installed
they are available to all users in the system, and possibly (depending on how the app sets it's permissions)
available to the public as well.

By default application zip files must be present on the server running the freehold instance before they can
be installed. Any .zip file in the folder *<freehold executable>/application/available/* will be listed as an application
available to install. Installation of non-local applications can be accomplished by changing the setting **AllowWebAppInstall**, and making POST of that file to /v1/application/available.  This will download the application file to the server and make it available for install.  Note, this should only be done if you trust the source of the application file.

The application zip file must have a file called app.json in the following format:
```
{
	"id": "datastore-manager",
	"name": "Datastore Manager",
	"version": "0.1",
	"description": "Application for managing datastore files.",
	"author": "Tim Shannon - shannon.timothy@gmail.com",
	"root": "/datastore-manager/v1/file/index.html",
	"icon": "/datastore-manager/v1/file/images/ds-icon.png"
}
```
* id - Path on which the application will be installed (`https://host/<app-id>/`). Must not match any existing installed
applications, or any paths used by the freehold instance (i.e. /v1 /v2, etc). 
* name - User visible name of the application
* version - Version of the application. Can be any string ("0.01", "BreezyBadger", etc.). Is not used by the server side, but is there for use by client side applications usually to determine if application in the available folder matches the application already installed (e.g. for upgrades). 
* description - Description of what the application does
* author - Who wrote the application
* root - File to which users will be redirected to when accessing the apps root path: `https://host/<app-id>`
* icon - Image file usually used in the home app for displaying in the link to a given application

While not part of the server side installation, if you include an `install.js` file at the root of your application, the core home application will dynamically load that file and execute a function named `installApp`.  Usually this script will consist of any pre-setup permissions (as they will be defaulted to private upon install) or any other setup that can't be done by the normal install process (i.e getting a list of active users and creating personal datastores for them, etc).  

*Datastore definition of Applications* - Only stores currently installed applications.  If an application is
removed, it's deleted from the datastore.
```
core/application.ds
{
	key: <app id>,
	value: {
		name: <name of the application>,
		version: <version of app>,
		description: <description>,
		author: <author>,
		root: <root file>,
		icon: <icon file>
	}
}
```

**GET**

*List All Applications* - All authenticated users
```
GET /v1/application

Response (200):
{
	status: "success",
	data: {
		"datastore-manager": {
			name: "Datastore Manager",
			version: "0.01",
			description: "Application for managing datastore files.",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "index.htm",
			icon: "/datastore-manager/v1/file/images/ds-icon.png"
		},
		"home": {
			name: "Home",
			version: "0.02",
			description: "Freehold Homepage",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "/v1/file/index.htm",
			icon: "/home/v1/file/images/home.png"
		}
	}
}
```

*List a specific application* - All authenticated users
```
GET /v1/application
{
	id: "home"
}

Response (200):
{
	status: "success",
	data: {
			name: "Home",
			version: "0.01",
			description: "Freehold Homepage",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "index.htm",
			icon: "/home/v1/file/images/home.png"
		}
}
```

*List Applications available for install* - Admins only.  file refers to the filepath relative to the application/available directory.
```
GET /v1/application/available

Response (200):
{
	status: "success",
	data: {
		"blog": {
			name: "Blog",
			version: "0.01",
			description: "Software for writing and publish a blog to the public",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "index.htm",
			icon: "/blog/v1/file/images/blog.png",
			file: "blog.zip"
		},
		"gallery": {
			name: "Gallery",
			version: "0.01",
			description: "Application for showing image files in a gallery format",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "index.htm",
			icon: "/gallery/v1/file/images/gallery.png",
			file: "gallery.zip"
		}
	}
}
```

**POST**

*Install an Application* - Admins only - 
Files must be in *<freehold executable>/application/available/* 

```
POST /v1/application
{
	file: "blog.zip"
}

Response (201):
{
	status: "success",
	data: {
			id: "blog",
			name: "Blog",
			version: "0.01",
			description: "Software for writing and publish a blog to the public",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "index.htm",
			icon: "/blog/v1/file/images/blog.png"
	}
}
```

*Get a remote application file and make it available for install* - Admins only
```
POST /v1/application/available
{
	file: "https://github.com/developer/freehold-blog/blog.zip"
}

Response (201):
{
	status: "success",
	data: "https://github.com/developer/freehold-blog/blog.zip"
}
```




**PUT**

*Upgrade an Application* - Admins only - 
Files must be in *<freehold executable>/application/available/* or (if web-install is enabled) a valid
url. POSTing the same application that is already installed will fail.  PUTing it will replace
the existing application with the new files from the install file.
```
PUT /v1/application
{
	file: "blog.zip"
}

Response (200):
{
	status: "success",
	data: {
			id: "blog",
			name: "Blog",
			version: "0.01",
			description: "Software for writing and publish a blog to the public",
			author: "Tim Shannon - shannon.timothy@gmail.com",
			root: "index.htm",
			icon: "/blog/v1/file/images/blog.png"
	}
}
```

**DELETE**

*Uninstall an Application* - Admins only
```
DELETE /v1/application
{
	id: "blog" 
} 

Response (200):
{
	status: "success"
}
```

* * *

<a name="logs"></a> Logs 
======================
By default only some things are logged, but the core settings can be changed to log other things such as access,
failed authentication attempts, etc.

```
core/log.ds
{
	key: <timestamp>,
	value: {
		type: <log type>,
		log: <log entry>
	}
}
```

**GET**

*List Logs* - Admins only
```
GET /v1/log
{
	iter: {
		type: <type>,
		from: <timestamp>,
		to: <timestamp>,
		skip: <count>,
		order: <"asc" | "dsc">,
		limit: <count>
	}
}

Response (200):
{
	status: "success",
	data: [
		{
			when: "2014-04-23T18:25:43.511Z",
			type: "error",
			log: "Can't write file wikipedia.zip due to lack of disk space."
		},
		{
			when: "2014-04-14T18:25:43.511Z",
			type: "authentication",
			log: "User tshannon failed to log in."
		},
		{
			when: "2014-05-14T18:25:43.511Z",
			type: "authentication",
			log: "An expired security token for user tshannon with an id of aaabbbccc was used"
		},
	]
}
```


* * *

<a name="communication"></a> Communication
======================
/v1/com/
--------

/v1/com/xmpp
------------

TODO: XMPP, client?  Server would be nice too, but none currently exist for Go.

/v1/com/webrtc
-------------

TODO: WebRTC backend

/v1/com/irc
------------

TODO: IRC client

/v1/com/rss
------------

TODO: Retrieving RSS feeds
TODO: Generate an RSS feed from a Datastore

* * *

<a name="calendar"></a> Calendar
========
TODO: built in calendar functionality, exports to ical would be nice.


<a name="tasks"></a> Tasks
========
/v1/task/
--------------------
TODO: Scheduled rest requests, scheduled based on calendar functionality
/v1/task/<urlpath>

ex. /v1/task/v1/datastore/tshannon/tasktest.ds

Use treemux to alias entire root mux


* * *

<a name="notification"></a> Notification
==============================================
/v1/notification/
---------------------
TODO: User Notifications.  Core notifications get added for communication, tasks finishing, calendar events, etc.  Any app can make their own notifications as well.



<a name="backup"></a> Backup
=============
Backup core datastores into a zip file stored in the freehold instance.  Generating a backup can only be done from a Basic Authentication connection.  Sessions or Security Tokens cannot be used.  The location of the backup file can be set in the request.  It is recommended to download those generated backup files and store them elsewhere for a true backup.

```
core/backup.ds
{
	key: <timestamp>,
	value: {
		when:	<When the backup was taken>,
		file: <Filename of the backup>,
		who: <Who generated the backup file>,
		datastores: [<list of datastores in the backupfile>],
	}
}
```

**GET**

*View previous generated backups* - Admins only, `to` is optional
```
GET /v1/backup/
{
	from: "2015-04-23T18:25:43.511Z",
	to: "2015-05-01T18:25:43.511Z",
}

Response (200):
data: [
		{
			when: "2014-04-23T18:25:43.511Z",
			file: "/v1/file/freehold_backup-2015-04-23T18:25:43.511Z.zip",
			who: "tshannon",
			datastores: [
				"user",
				"log",
				"app",               
				"log"
				"permission",
				"ratelimit",
				"session",
				"token",
				"user"
			],
		},
		{
			when: "2014-04-30T18:25:43.511Z",
			file: "/v1/file/freehold_backup-2015-04-30T18:25:43.511Z.zip",
			who: "tshannon",
			datastores: [
				"user",
				"log",
				"app",               
				"log"
				"permission",
				"ratelimit",
				"session",
				"token",
				"user"
			],
		},
]


```

*Generate a new backup file* - Admins only, file is required.  You can specify a folder instead of a file, and if the folder doesn't exist, it will be created, and the filename will be defaulted to `freehold_backup-<timestamp>`
 
```
POST /v1/backup/
{
	file: "/v1/file/backups/freehold_backup-2015-04-01T18:25:43.511Z.zip"
}

Response (201):
{
	status: "success",
	data: "/v1/file/backups/freehold_backup-2015-04-01T18:25:43.511Z.zip"
}

```


*Generate a backup file a specific set of Core Datastores* - Admins only
```
POST /v1/backup/
{
	file: "/v1/file/backups/freehold_backup-2015-04-01T18:25:43.511Z.zip",
	datastores:	[
		"user",
		"log",
	]
}

Response (201):
{
	status: "success",
	data: "/v1/file/backups/freehold_backup-2015-04-01T18:25:43.511Z.zip"
}

```


