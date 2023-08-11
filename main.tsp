import "@typespec/rest";
import "@typespec/openapi3";
import "tsp-rust";

@service({
    title: "NPM Registry",
    version: "0.1.0",
})
// @useAuth(ApiKeyAuth<ApiKeyLocation.header, "api_key">)
namespace NpmRegistry;

using TypeSpec.Http;

/*
Registry

db_name: "registry"
doc_count: 376841,
doc_del_count: 354,
update_seq: 2889325,
purge_seq: 0,
compact_running: false,
disk_size: 2098360443,
data_size: 1485346312,
instance_start_time: "1471680653634734",
disk_format_version: 6,
committed_update_seq: 2889325
 */
model RegistryMetadata {
    db_name: string;
    doc_count: usize;
    doc_del_count: usize;
    update_seq: isize;
    purge_seq: isize;
    compact_running: boolean;
    disk_size: usize;
    data_size: usize;
    instance_start_time: string;
    disk_format_version: isize;
    committed_update_seq: isize;
}

/*
Package

_id: the package name
_rev: latest revision id
name: the package name
description: description from the package.json
dist-tags: an object with at least one key, latest, representing dist-tags
versions: a List of all Version objects for the Package
time: an object containing a created and modified time stamp
author: object with name, email, and or url of author as listed in package.json
repository: object with type and url of package repository as listed in package.json
_attachments: http://docs.couchdb.org/en/2.0.0/intro/api.html#attachments
readme: full text of the latest version's README
*/
model Package {
    _id: string;
    _rev: string;
    name: string;
    description: string;

    @projectedName("json", "dist-tags")
    dist_tags: DistTags;

    versions: Record<Version>;
    time: Record<string>;

    // author: string | Author;
    // repository: string | Repository;

    // _attachments: Record<unknown> | null;

    readme?: string;
}

alias DistTags = Record<string>;

model Time {
    created: string;
    modified: string;
}

model Author {
    name: string;
    email?: string;
    url?: string;
}

model Repository {
    type: string;
    url: string;
}

/*
Version

name: package name,
version: version number
homepage: homepage listed in the package.json
repository: object with type and url of package repository as listed in package.json
dependencies: object with dependencies and versions as listed in package.json
devDependencies: object with devDependencies and versions as listed in package.json
scripts: object with scripts as listed in package.json
author: object with name, email, and or url of author as listed in package.json
license: as listed in package.json
readme: full text of README ile as pointed to in package.json
readmeFilename: name of README file
_id: <name>@<version>
description: description as listed in package.json
dist: and object containing a shasum and tarball url, usually in the form of https://registry.npmjs.org/<name>/-/<name>-<version>.tgz
_npmVersion: version of npm the package@version was published with
_npmUser: an object containing the name and email of the npm user who published the package@version
maintainers: and array of objects containing author objects as listed in package.json
directories:???
*/
model Version {
    name: string;
    version: string;
    homepage: string;

    // repository: Repository;
    dependencies: Record<string>;

    devDependencies: Record<string>;
    scripts: Record<string>;

    // author: string | Author;
    license: string;

    readme?: string;
    readmeFilename?: string;
    _id: string;
    description: string;
    dist: Dist;
    _npmVersion: string;

    // _npmUser: string | Author;
    // maintainers: (Author | string)[];

    // directories: unknown;
}

model Dist {
    shasum: string;
    tarball: string;
    integrity: string;
}

/*
{
  "objects": [
    {
      "package": {
        "name": "yargs",
        "version": "6.6.0",
        "description": "yargs the modern, pirate-themed, successor to optimist.",
        "keywords": [
          "argument",
          "args",
          "option",
          "parser",
          "parsing",
          "cli",
          "command"
        ],
        "date": "2016-12-30T16:53:16.023Z",
        "links": {
          "npm": "https://www.npmjs.com/package/yargs",
          "homepage": "http://yargs.js.org/",
          "repository": "https://github.com/yargs/yargs",
          "bugs": "https://github.com/yargs/yargs/issues"
        },
        "publisher": {
          "username": "bcoe",
          "email": "ben@npmjs.com"
        },
        "maintainers": [
          {
            "username": "bcoe",
            "email": "ben@npmjs.com"
          },
          {
            "username": "chevex",
            "email": "alex.ford@codetunnel.com"
          },
          {
            "username": "nexdrew",
            "email": "andrew@npmjs.com"
          },
          {
            "username": "nylen",
            "email": "jnylen@gmail.com"
          }
        ]
      },
      "score": {
        "final": 0.9237841281241451,
        "detail": {
          "quality": 0.9270640902288084,
          "popularity": 0.8484861649808381,
          "maintenance": 0.9962706951777409
        }
      },
      "searchScore": 100000.914
    }
  ],
  "total": 1,
  "time": "Wed Jan 25 2017 19:23:35 GMT+0000 (UTC)"
}
*/
model SearchResults {
    objects: SearchResult[];
    total: usize;
    time: string;
}

model SearchResult {
    package: SearchPackage;
    score: Score;
    searchScore: float64;
}

model SearchPackage {
    name: string;
    version: string;
    description: string;
    keywords: string[];
    date: string;
    links: Record<string>;
    // publisher: SearchPublisher;
    // maintainers: SearchMaintainer[];
}

model Score {
    final: float64;
    detail: ScoreDetail;
}

model ScoreDetail {
    quality: float64;
    popularity: float64;
    maintenance: float64;
}

alias Response<T> = Success<T> | Error;

model Success<T> {
    @statusCode code: 200;
    @body body: T;
}

@error
model Error {
    message: string;
}

interface Registry {
    @route("/")
    getRegistryMetadata(): RegistryMetadata;

    @route("/{package}")
    getPackage(@path package: string): Package;

    @route("/{package}/{version}")
    getPackageVersion(
        @path package: string,
        @path version: string,
    ): Version;

    /*
    text	String	Query	❌	full-text search to apply
    size	integer	Query	❌	how many results should be returned (default 20, max 250)
    from	integer	Query	❌	offset to return results from
    quality	float	Query	❌	how much of an effect should quality have on search results
    popularity	float	Query	❌	how much of an effect should popularity have on search results
    maintenance	float	Query	❌	how much of an effect should maintenance have on search results
    */
    @route("/-/v1/search")
    search(
        @query text?: string,
        @query size?: usize,
        @query from?: usize,
        @query quality?: float64,
        @query popularity?: float64,
        @query maintenance?: float64,
    ): SearchResults;

    @route("/fake_br")
    op fake_br(@body foo: RegistryMetadata): RegistryMetadata;
    @route("/fake_bo")
    op fake_bo(@body foo?: RegistryMetadata): RegistryMetadata;
    @route("/fake_br_wo")
    op fake_br_wo(@body foo: RegistryMetadata, @query test?: string): RegistryMetadata;
    @route("/fake_bo_wo")
    op fake_bo_wo(@body foo?: RegistryMetadata, @query test?: string): RegistryMetadata;
    
    @route("/fake_hd")
    op fake_hd(@header("X-Foo") foo: string): RegistryMetadata;

    @route("/fake_hdo")
    op fake_hdo(@header("X-Foo") foo?: string): RegistryMetadata;

    @route("/everything")
    op fake_everything(
        @body foo: RegistryMetadata,
        @query test?: string,
        @query test_r: string,
        @query("r2") test_r2: string,
        @header("X-Foo2") foo2: string,
        @header("X-FooH") foo2h?: string,
        @header "X-Foo3": string;
        @header "X-Foo4"?: string;
    ): Response<RegistryMetadata>;
}
