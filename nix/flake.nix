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
        # Node 与 pnpm 由用户环境提供（如 nvm），Flake 只提供 Rust 工具链与 ops wrapper。
        opsCommand = pkgs.writeShellApplication {
          name = "ops";
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

        # 交叉编译发布包专用 shell:zig/cargo-zigbuild 必须来自锁定的
        # nixos-26.05,禁止走滚动的 nixpkgs# 注册表(unstable 一更新,
        # 发布 CI 就可能拿到未经本项目验证的工具链)。
        cross = pkgs.mkShell {
          packages = with pkgs; [
            zig
            cargo-zigbuild
          ];
        };
      });
    };
}
