use anchor_lang::prelude::*;

anchor_gen::generate_cpi_interface!(
    idl_path = "amm_v3.json",
    zero_copy(TickArray, Tick),
    packed(TickArray, Tick)
);

declare_id!("2mEsbBnNoWjbbxaTtzRhckgQYF8twigyrRK78kpRiNS8");
