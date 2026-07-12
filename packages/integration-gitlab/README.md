# @streetstudio/integration-gitlab

GitLab source control integration delivered as an isolated plugin (Requirements
21.8, 24.2). Implements the `Plugin` contract from `@streetstudio/plugins`;
discovered and loaded through the StreetJS plugin loader. Exposes repository and
pull-request (merge request) access used by Engineering Reviews. No GitLab vendor
SDK is imported into platform core.
