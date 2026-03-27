// Auto-generated keyboard case
// Layout: Blue Dream Space (86 keys)
// Switch type: choc_v2
// Front height: 3.90 mm
// Rear height: 3.90 mm
// Generated: 2026-03-27T05:22:26.663Z

$fn = 32;

wall = 2.50;
bottom_t = 2.00;
inner_h = 10.00;
outer_w = 349.76;
outer_h = 139.06;
total_h = 3.90;
front_h = 3.90;
rear_h = 3.90;
corner_r = 3.00;
plate_w = 344.76;
plate_h = 134.06;

// ----- Case shell -----
difference() {
  // Outer shell with rounded corners
  minkowski() {
    cube([outer_w - 2*corner_r, outer_h - 2*corner_r, total_h / 2]);
    translate([corner_r, corner_r, 0])
      cylinder(r = corner_r, h = total_h / 2);
  }

  // Inner cavity
  translate([wall, wall, bottom_t])
    minkowski() {
      cube([plate_w - 2*corner_r, plate_h - 2*corner_r, inner_h + 0.1]);
      translate([corner_r, corner_r, 0])
        cylinder(r = corner_r, h = 0.01);
    }

  // USB-C cutout (back edge)
  translate([168.878, 136.463, 3.000])
    cube([12.000, 2.700, 7.000]);

  // ----- Screw holes (smart placement) -----
  // screw_tl
  translate([22.500, 22.500, -0.1])
    cylinder(r = 1.250, h = bottom_t + 0.2);
  // screw_tr
  translate([357.000, 23.000, -0.1])
    cylinder(r = 1.250, h = bottom_t + 0.2);
  // screw_bl
  translate([22.500, 146.500, -0.1])
    cylinder(r = 1.250, h = bottom_t + 0.2);
  // screw_br
  translate([357.000, 146.500, -0.1])
    cylinder(r = 1.250, h = bottom_t + 0.2);
  // screw_ml
  translate([127.500, 45.500, -0.1])
    cylinder(r = 1.250, h = bottom_t + 0.2);
  // screw_mr
  translate([281.500, 96.000, -0.1])
    cylinder(r = 1.250, h = bottom_t + 0.2);
}

// ----- PCB standoff posts (no front standoffs) -----
// screw_tl
translate([22.500, 22.500, bottom_t])
  difference() {
    cylinder(r = 2.500, h = 3.000);
    translate([0, 0, -0.1])
      cylinder(r = 1.250, h = 3.200);
  }
// screw_tr
translate([357.000, 23.000, bottom_t])
  difference() {
    cylinder(r = 2.500, h = 3.000);
    translate([0, 0, -0.1])
      cylinder(r = 1.250, h = 3.200);
  }
// screw_bl
translate([22.500, 146.500, bottom_t])
  difference() {
    cylinder(r = 2.500, h = 3.000);
    translate([0, 0, -0.1])
      cylinder(r = 1.250, h = 3.200);
  }
// screw_br
translate([357.000, 146.500, bottom_t])
  difference() {
    cylinder(r = 2.500, h = 3.000);
    translate([0, 0, -0.1])
      cylinder(r = 1.250, h = 3.200);
  }
// screw_ml
translate([127.500, 45.500, bottom_t])
  difference() {
    cylinder(r = 2.500, h = 3.000);
    translate([0, 0, -0.1])
      cylinder(r = 1.250, h = 3.200);
  }
// screw_mr
translate([281.500, 96.000, bottom_t])
  difference() {
    cylinder(r = 2.500, h = 3.000);
    translate([0, 0, -0.1])
      cylinder(r = 1.250, h = 3.200);
  }

// ----- Battery compartment -----
// Recessed area in the bottom for battery
difference() {
  translate([7.500, 7.500, bottom_t])
    cube([35.000, 20.000, 0.8]);
  translate([7.500, 7.500, bottom_t - 0.1])
    cube([35.000, 20.000, 8.000]);
}
// Battery pocket (cut into bottom)
// Actual depth: 8 mm
