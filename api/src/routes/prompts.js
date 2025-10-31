import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

// Get all prompts
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Get single prompt
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Create new prompt
router.post('/', async (req, res, next) => {
  try {
    const { name, system_prompt, model, response_format } = req.body;

    if (!name || !system_prompt) {
      return res.status(400).json({ error: 'Name and system_prompt are required' });
    }

    const { data, error } = await supabase
      .from('prompts')
      .insert({
        name,
        system_prompt,
        model: model || 'gpt-3.5-turbo',
        response_format: response_format || { type: 'json_object' },
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

// Update prompt
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, system_prompt, model, response_format } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;
    if (model !== undefined) updates.model = model;
    if (response_format !== undefined) updates.response_format = response_format;

    const { data, error } = await supabase
      .from('prompts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Delete prompt
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase.from('prompts').delete().eq('id', id);

    if (error) throw error;

    res.json({ message: 'Prompt deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
