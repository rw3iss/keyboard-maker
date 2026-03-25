#!/usr/bin/env python3
"""
3D Keyboard Assembler — FreeCAD script

Assembles PCB STEP + plate STL + case STL into a combined 3D model.
Can render a PNG preview or export a combined STEP.

Usage:
  freecadcmd assemble.py --pcb pcb.step --plate plate.stl --case case.stl --output assembled.step
  freecadcmd assemble.py --pcb pcb.step --plate plate.stl --case case.stl --render render.png

Or run standalone (uses FreeCAD Python):
  python3 assemble.py --pcb pcb.step --plate plate.stl --case case.stl --output assembled.step
"""

import argparse
import sys
import os


def check_freecad():
    """Check if FreeCAD Python modules are available."""
    try:
        import FreeCAD
        return True
    except ImportError:
        return False


def assemble(pcb_path=None, plate_path=None, case_path=None,
             output_path=None, render_path=None,
             pcb_thickness=1.6, plate_thickness=1.5, plate_offset=3.0):
    """
    Assemble keyboard components into a single model.

    Args:
        pcb_path: Path to PCB STEP file (from KiCad export)
        plate_path: Path to plate STL file (from OpenSCAD)
        case_path: Path to case STL file (from OpenSCAD)
        output_path: Path to write combined STEP file
        render_path: Path to write rendered PNG
        pcb_thickness: PCB thickness in mm
        plate_thickness: Plate thickness in mm
        plate_offset: Height of plate above PCB top surface in mm
    """
    import FreeCAD
    import Part
    import Mesh

    doc = FreeCAD.newDocument("KeyboardAssembly")
    parts = []

    # Import PCB
    if pcb_path and os.path.exists(pcb_path):
        print(f"  Loading PCB: {pcb_path}")
        pcb_shape = Part.read(pcb_path)
        pcb_obj = doc.addObject("Part::Feature", "PCB")
        pcb_obj.Shape = pcb_shape
        # PCB at Z=0 (KiCad exports with correct positioning)
        parts.append(pcb_obj)
    else:
        print("  Warning: No PCB STEP file — skipping PCB layer")

    # Import plate
    if plate_path and os.path.exists(plate_path):
        print(f"  Loading plate: {plate_path}")
        if plate_path.endswith('.stl'):
            mesh = Mesh.Mesh(plate_path)
            plate_obj = doc.addObject("Mesh::Feature", "Plate")
            plate_obj.Mesh = mesh
        else:
            plate_shape = Part.read(plate_path)
            plate_obj = doc.addObject("Part::Feature", "Plate")
            plate_obj.Shape = plate_shape
        # Position plate above PCB
        plate_obj.Placement = FreeCAD.Placement(
            FreeCAD.Vector(0, 0, pcb_thickness + plate_offset),
            FreeCAD.Rotation()
        )
        parts.append(plate_obj)
    else:
        print("  Warning: No plate file — skipping plate layer")

    # Import case
    if case_path and os.path.exists(case_path):
        print(f"  Loading case: {case_path}")
        if case_path.endswith('.stl'):
            mesh = Mesh.Mesh(case_path)
            case_obj = doc.addObject("Mesh::Feature", "Case")
            case_obj.Mesh = mesh
        else:
            case_shape = Part.read(case_path)
            case_obj = doc.addObject("Part::Feature", "Case")
            case_obj.Shape = case_shape
        # Position case below PCB
        case_obj.Placement = FreeCAD.Placement(
            FreeCAD.Vector(0, 0, -5),  # case bottom below PCB
            FreeCAD.Rotation()
        )
        parts.append(case_obj)
    else:
        print("  Warning: No case file — skipping case layer")

    if not parts:
        print("  Error: No parts to assemble")
        return False

    doc.recompute()

    # Export combined STEP
    if output_path:
        print(f"  Exporting assembled STEP: {output_path}")
        shapes = []
        for p in parts:
            if hasattr(p, 'Shape'):
                shapes.append(p.Shape)
        if shapes:
            compound = Part.makeCompound(shapes)
            compound.exportStep(output_path)
            print(f"  Done: {output_path}")
        else:
            print("  Warning: No STEP-compatible shapes to export (meshes can't be exported as STEP)")
            # Fall back to STL export
            stl_path = output_path.replace('.step', '.stl')
            meshes = []
            for p in parts:
                if hasattr(p, 'Mesh'):
                    meshes.append(p.Mesh)
                elif hasattr(p, 'Shape'):
                    meshes.append(Mesh.Mesh(p.Shape.tessellate(0.1)))
            if meshes:
                combined = meshes[0].copy()
                for m in meshes[1:]:
                    combined.addMesh(m)
                combined.write(stl_path)
                print(f"  Exported as STL instead: {stl_path}")

    # Render PNG (requires FreeCADGui — may not work headless)
    if render_path:
        try:
            import FreeCADGui
            FreeCADGui.showMainWindow()
            FreeCADGui.activateWorkbench("PartWorkbench")
            view = FreeCADGui.ActiveDocument.ActiveView
            view.fitAll()
            view.saveImage(render_path, 2560, 1440, "Current")
            print(f"  Rendered: {render_path}")
        except Exception as e:
            print(f"  Render failed (may need display): {e}")
            print("  Use KiCad's 3D viewer or the Three.js viewer instead.")

    FreeCAD.closeDocument("KeyboardAssembly")
    return True


def main():
    parser = argparse.ArgumentParser(description='Assemble keyboard 3D model')
    parser.add_argument('--pcb', help='PCB STEP file path')
    parser.add_argument('--plate', help='Plate STL/STEP file path')
    parser.add_argument('--case', help='Case STL/STEP file path')
    parser.add_argument('--output', help='Output STEP file path')
    parser.add_argument('--render', help='Output PNG render path')
    parser.add_argument('--pcb-thickness', type=float, default=1.6, help='PCB thickness (mm)')
    parser.add_argument('--plate-thickness', type=float, default=1.5, help='Plate thickness (mm)')
    parser.add_argument('--plate-offset', type=float, default=3.0, help='Plate height above PCB (mm)')
    args = parser.parse_args()

    if not check_freecad():
        print("Error: FreeCAD Python modules not found.")
        print("Run this script with freecadcmd:")
        print(f"  freecadcmd {__file__} {' '.join(sys.argv[1:])}")
        print("")
        print("Or install FreeCAD and ensure its Python path is configured:")
        print("  Ubuntu: sudo apt install freecad")
        print("  macOS: brew install --cask freecad")
        sys.exit(1)

    if not any([args.pcb, args.plate, args.case]):
        parser.print_help()
        sys.exit(1)

    success = assemble(
        pcb_path=args.pcb,
        plate_path=args.plate,
        case_path=args.case,
        output_path=args.output,
        render_path=args.render,
        pcb_thickness=args.pcb_thickness,
        plate_thickness=args.plate_thickness,
        plate_offset=args.plate_offset,
    )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
