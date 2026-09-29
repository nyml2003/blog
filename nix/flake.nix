{
  description = "Local development environment for the blog MVP";

  inputs = {
    # 锁定 release 分支：发布后仅收安全与关键修复，作为不滚动的主锚点。
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAllSystems (pkgs:
        let
        opsCommand = pkgs.writeShellApplication {
          name = "ops";
          runtimeInputs = with pkgs; [ nodejs_24 ];
          text = ''
            set -euo pipefail
            workspace_root="''${DIRENV_DIR-}"
            workspace_root="''${workspace_root#-}"
            if [ -z "$workspace_root" ]; then
              workspace_root="$PWD"
            fi
            export OPS_WORKSPACE_ROOT="$workspace_root"

            root="$OPS_WORKSPACE_ROOT"
            while :; do
              if [ -f "$root/apps/blog/src/main.ts" ]; then
                exec node --experimental-strip-types "$root/apps/blog/src/main.ts" "$@"
              fi

              if [ "$root" = "/" ] || [ -z "$root" ]; then
                break
              fi

              parent="''${root%/*}"
              if [ "$parent" = "$root" ] || [ -z "$parent" ]; then
                root="/"
              else
                root="$parent"
              fi
            done
            echo "ops: could not locate workspace from $OPS_WORKSPACE_ROOT" >&2
            exit 1
          '';
        };
        in {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            pnpm
            rustc
            cargo
            rustfmt
            clippy
            wasm-bindgen-cli
            lld
            sqlite
            opsCommand
          ];
          shellHook = ''
            export PATH="${opsCommand}/bin:$PATH"
          '';
        };
      });
    };
}
