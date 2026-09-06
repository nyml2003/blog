let
  workspace = builtins.getFlake (toString ../.);
  pkgs = workspace.inputs.nixpkgs.legacyPackages.${builtins.currentSystem};
in
pkgs.symlinkJoin {
  name = "blog-browser-test-libraries";
  paths = map pkgs.lib.getLib (with pkgs; [
    glibc glib nspr nss at-spi2-core dbus libX11 libXcomposite libXdamage
    libXext libXfixes libXrandr libgbm expat libxcb libxkbcommon systemd alsa-lib
  ]);
}
